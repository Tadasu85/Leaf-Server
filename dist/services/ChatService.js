"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ChatService {
    constructor(io, logger) {
        this.cleanupInterval = null;
        // Keepalive tracking
        this.keepaliveRequests = new Map(); // Username -> keepalive data
        this.keepaliveTimeout = 10000; // 10 seconds to respond to keepalive
        this.keepaliveCheckInterval = 300000; // 5 minutes between cleanup checks
        this.io = io;
        this.logger = logger;
        this.chatChannels = new Map();
        this.socketToUser = new Map();
        this.userToSocket = new Map();
        // Set up periodic cleanup of stale players (only in non-test environments)
        if (process.env['NODE_ENV'] !== 'test') {
            this.logger.info(`[ChatService] Setting up cleanup interval every ${this.keepaliveCheckInterval}ms`);
            this.cleanupInterval = setInterval(() => {
                this.logger.info(`[ChatService] Running periodic cleanup check`);
                this.cleanupStalePlayers();
            }, this.keepaliveCheckInterval);
        }
        else {
            this.logger.info(`[ChatService] Skipping cleanup interval setup in test environment`);
        }
    }
    // Handle user connection
    handleConnection(_socket) {
        // Socket will be associated with user when they join a channel
    }
    // Handle user disconnection
    handleDisconnection(socket) {
        const username = this.socketToUser.get(socket.id);
        if (username) {
            this.logger.info(`User ${username} disconnected from chat`);
            this.logger.info(`[ChatService] Removing user ${username} from channels: ${JSON.stringify(Array.from(socket.rooms).filter(r => r !== socket.id))}`);
            this.socketToUser.delete(socket.id);
            this.userToSocket.delete(username);
            // Clear any pending keepalive requests for this user
            this.clearKeepaliveRequest(username);
            // Remove user from all chat channels
            const userChannels = Array.from(socket.rooms).filter(r => r !== socket.id);
            userChannels.forEach(channelId => {
                this.logger.info(`[ChatService] Removing ${username} from channel ${channelId}`);
                this.removeUserFromChannel(channelId, username);
            });
        }
        else {
            this.logger.info(`[ChatService] Socket ${socket.id} disconnected but no username found`);
        }
    }
    // Send keepalive request to a user
    sendKeepaliveRequest(username) {
        const socketId = this.userToSocket.get(username);
        if (!socketId) {
            this.logger.warn(`[ChatService] Cannot send keepalive to ${username} - no socket found`);
            return;
        }
        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
            this.logger.warn(`[ChatService] Cannot send keepalive to ${username} - socket not found`);
            return;
        }
        // Clear any existing keepalive request
        this.clearKeepaliveRequest(username);
        // Send keepalive request
        const keepaliveData = { timestamp: Date.now() };
        socket.emit('keepalive', keepaliveData);
        this.logger.info(`[ChatService] Sent keepalive request to ${username}`);
        // Set up timeout to handle no response
        const timeoutId = setTimeout(() => {
            this.handleKeepaliveTimeout(username);
        }, this.keepaliveTimeout);
        // Track the keepalive request
        this.keepaliveRequests.set(username, {
            timestamp: Date.now(),
            timeoutId
        });
    }
    // Handle keepalive response from client
    handleKeepaliveResponse(socket) {
        const username = this.socketToUser.get(socket.id);
        if (!username) {
            this.logger.warn(`[ChatService] Keepalive response from unknown socket ${socket.id}`);
            return;
        }
        this.clearKeepaliveRequest(username);
        this.logger.info(`[ChatService] Received keepalive response from ${username}`);
    }
    // Handle keepalive timeout (no response received)
    handleKeepaliveTimeout(username) {
        this.logger.info(`[ChatService] Keepalive timeout for ${username} - removing from all channels`);
        // Remove user from all channels they're in
        const userChannels = this.getChannelsForUser(username);
        userChannels.forEach(channelId => {
            this.removeUserFromChannel(channelId, username);
        });
        // Clean up user tracking
        const socketId = this.userToSocket.get(username);
        if (socketId) {
            this.socketToUser.delete(socketId);
            this.userToSocket.delete(username);
        }
        this.clearKeepaliveRequest(username);
    }
    // Clear keepalive request for a user
    clearKeepaliveRequest(username) {
        const keepaliveData = this.keepaliveRequests.get(username);
        if (keepaliveData) {
            clearTimeout(keepaliveData.timeoutId);
            this.keepaliveRequests.delete(username);
        }
    }
    // Get all channels a user is in
    getChannelsForUser(username) {
        const channels = [];
        for (const [channelId, channel] of this.chatChannels.entries()) {
            if (channel.players.includes(username)) {
                channels.push(channelId);
            }
        }
        return channels;
    }
    // Join a chat channel
    joinChannel(socket, data) {
        this.logger.info(`=== CHAT SERVICE JOIN CHANNEL CALLED ===`);
        this.logger.info(`[ChatService] joinChannel method called with username: ${data.username}, channelId: ${data.channelId}`);
        const { channelId, username } = data;
        if (!channelId || !username) {
            socket.emit('error', { message: 'Missing channelId or username' });
            return;
        }
        // Track user
        this.socketToUser.set(socket.id, username);
        this.userToSocket.set(username, socket.id);
        // Join socket room
        socket.join(channelId);
        // Initialize or update channel
        if (!this.chatChannels.has(channelId)) {
            this.chatChannels.set(channelId, {
                players: [],
                lastUpdated: Date.now()
            });
        }
        const channel = this.chatChannels.get(channelId);
        // Clean up any stale entries - remove players who are no longer connected
        const connectedPlayers = Array.from(this.userToSocket.keys());
        const oldPlayers = [...channel.players];
        channel.players = channel.players.filter(player => connectedPlayers.includes(player));
        // Log if any players were cleaned up
        const removedPlayers = oldPlayers.filter(player => !connectedPlayers.includes(player));
        if (removedPlayers.length > 0) {
            this.logger.info(`[ChatService] Cleaned up disconnected players: ${JSON.stringify(removedPlayers)}`);
        }
        const wasAlreadyInChannel = channel.players.includes(username);
        this.logger.info(`[ChatService] User ${username} joining channel ${channelId}`);
        this.logger.info(`[ChatService] Current players in channel: ${JSON.stringify(channel.players)}`);
        this.logger.info(`[ChatService] Was already in channel: ${wasAlreadyInChannel}`);
        if (!wasAlreadyInChannel) {
            channel.players.push(username);
            channel.lastUpdated = Date.now();
            this.logger.info(`[ChatService] Updated players list: ${JSON.stringify(channel.players)}`);
            // Broadcast player joined event to all OTHER players in the channel
            const playerJoinedEvent = {
                username,
                players: channel.players,
                channelId
            };
            this.logger.info(`[ChatService] Broadcasting playerJoined to others: ${JSON.stringify(playerJoinedEvent)}`);
            socket.to(channelId).emit('playerJoined', playerJoinedEvent);
        }
        // Always send current channel state to the joining player
        const chatChannelState = {
            channelId,
            players: channel.players,
            lastUpdated: channel.lastUpdated
        };
        this.logger.info(`[ChatService] Sending chatChannelState to joining player: ${JSON.stringify(chatChannelState)}`);
        socket.emit('chatChannelState', chatChannelState);
        this.logger.info(`User ${username} joined chat channel ${channelId}`);
    }
    // Leave a chat channel
    leaveChannel(socket, data) {
        const { channelId, username } = data;
        if (!channelId || !username) {
            socket.emit('error', { message: 'Missing channelId or username' });
            return;
        }
        // Leave socket room
        socket.leave(channelId);
        // Remove user from channel
        this.removeUserFromChannel(channelId, username);
        this.logger.info(`User ${username} left chat channel ${channelId}`);
    }
    // Handle chat message
    handleMessage(socket, data) {
        const { channelId, username, message } = data;
        if (!channelId || !username || !message) {
            socket.emit('error', { message: 'Missing required fields' });
            return;
        }
        // Validate user is in channel
        const channel = this.chatChannels.get(channelId);
        if (!channel || !channel.players.includes(username)) {
            socket.emit('error', { message: 'Not in channel' });
            return;
        }
        // Broadcast message to channel
        const chatMessage = {
            username,
            message,
            timestamp: Date.now(),
            channelId
        };
        this.broadcastToChannel(channelId, 'chatMessage', chatMessage);
        this.logger.info(`Chat message from ${username} in ${channelId}: ${message}`);
    }
    // Handle emote
    handleEmote(socket, data) {
        const { channelId, username, emote } = data;
        if (!channelId || !username || !emote) {
            socket.emit('error', { message: 'Missing required fields' });
            return;
        }
        // Validate user is in channel
        const channel = this.chatChannels.get(channelId);
        if (!channel || !channel.players.includes(username)) {
            socket.emit('error', { message: 'Not in channel' });
            return;
        }
        // Broadcast emote to channel
        const emoteMessage = {
            username,
            emote,
            timestamp: Date.now(),
            channelId
        };
        this.broadcastToChannel(channelId, 'emote', emoteMessage);
        this.logger.info(`Emote from ${username} in ${channelId}: ${emote}`);
    }
    // Remove user from channel
    removeUserFromChannel(channelId, username) {
        this.logger.info(`[ChatService] removeUserFromChannel called for ${username} in ${channelId}`);
        const channel = this.chatChannels.get(channelId);
        if (channel) {
            this.logger.info(`[ChatService] Channel found, current players: ${JSON.stringify(channel.players)}`);
            const wasInChannel = channel.players.includes(username);
            this.logger.info(`[ChatService] Was ${username} in channel: ${wasInChannel}`);
            channel.players = channel.players.filter(p => p !== username);
            channel.lastUpdated = Date.now();
            this.logger.info(`[ChatService] Updated players list: ${JSON.stringify(channel.players)}`);
            // Clean up empty channels
            if (channel.players.length === 0) {
                this.chatChannels.delete(channelId);
                this.logger.info(`Cleaned up empty chat channel: ${channelId}`);
            }
            else if (wasInChannel) {
                // Broadcast player left event to remaining players
                const playerLeftEvent = {
                    username,
                    players: channel.players,
                    channelId
                };
                this.logger.info(`[ChatService] Broadcasting playerLeft: ${JSON.stringify(playerLeftEvent)}`);
                this.broadcastToChannel(channelId, 'playerLeft', playerLeftEvent);
                // Also emit chatChannelState for consistency
                const chatChannelState = {
                    channelId,
                    players: channel.players,
                    lastUpdated: channel.lastUpdated
                };
                this.logger.info(`[ChatService] Broadcasting chatChannelState: ${JSON.stringify(chatChannelState)}`);
                this.broadcastToChannel(channelId, 'chatChannelState', chatChannelState);
            }
            else {
                this.logger.info(`[ChatService] User ${username} was not in channel, no events broadcast`);
            }
        }
        else {
            this.logger.info(`[ChatService] Channel ${channelId} not found`);
        }
    }
    // Broadcast to channel
    broadcastToChannel(channelId, event, data) {
        this.logger.debug(`Broadcasting ${event} to ${channelId}:`, data);
        this.io.to(channelId).emit(event, data);
    }
    // Get channel info
    getChannelInfo(channelId) {
        return this.chatChannels.get(channelId) || null;
    }
    // Get all channels
    getAllChannels() {
        return Array.from(this.chatChannels.entries());
    }
    // Clean up stale players from all channels using keepalive system
    cleanupStalePlayers() {
        const connectedPlayers = Array.from(this.userToSocket.keys());
        let keepaliveSent = 0;
        this.logger.info(`[ChatService] Cleanup check - Connected players: ${JSON.stringify(connectedPlayers)}`);
        this.logger.info(`[ChatService] Cleanup check - Active channels: ${this.chatChannels.size}`);
        for (const [_channelId, channel] of this.chatChannels.entries()) {
            // Find players who are in the channel but not in the connected players list
            const stalePlayers = channel.players.filter(player => !connectedPlayers.includes(player));
            if (stalePlayers.length > 0) {
                this.logger.info(`[ChatService] Found stale players in channel: ${JSON.stringify(stalePlayers)}`);
            }
            // Send keepalive requests to stale players
            stalePlayers.forEach(player => {
                // Only send keepalive if we don't already have a pending request
                if (!this.keepaliveRequests.has(player)) {
                    this.sendKeepaliveRequest(player);
                    keepaliveSent++;
                }
                else {
                    this.logger.info(`[ChatService] Keepalive already pending for ${player}`);
                }
            });
        }
        if (keepaliveSent > 0) {
            this.logger.info(`[ChatService] Sent keepalive requests to ${keepaliveSent} potentially stale players`);
        }
        else {
            this.logger.info(`[ChatService] No keepalive requests sent - all players appear to be connected`);
        }
    }
    // Get service status
    getStatus() {
        return {
            activeChannels: this.chatChannels.size,
            connectedUsers: this.socketToUser.size,
            channels: Array.from(this.chatChannels.keys())
        };
    }
    // Cleanup method to stop intervals and clear data
    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        // Clear all pending keepalive requests
        for (const [_username, keepaliveData] of this.keepaliveRequests.entries()) {
            clearTimeout(keepaliveData.timeoutId);
        }
        this.keepaliveRequests.clear();
        this.chatChannels.clear();
        this.socketToUser.clear();
        this.userToSocket.clear();
    }
}
exports.default = ChatService;
//# sourceMappingURL=ChatService.js.map