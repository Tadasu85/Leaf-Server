"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ChatService {
    constructor(io, logger) {
        this.io = io;
        this.logger = logger;
        this.chatChannels = new Map();
        this.socketToUser = new Map();
        this.userToSocket = new Map();
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
            this.socketToUser.delete(socket.id);
            this.userToSocket.delete(username);
            // Remove user from all chat channels
            const userChannels = Array.from(socket.rooms).filter(r => r !== socket.id);
            userChannels.forEach(channelId => {
                this.removeUserFromChannel(channelId, username);
            });
        }
    }
    // Join a chat channel
    joinChannel(socket, data) {
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
        if (!channel.players.includes(username)) {
            channel.players.push(username);
            channel.lastUpdated = Date.now();
            // Broadcast player joined event to all players in the channel
            const playerJoinedEvent = {
                username,
                players: channel.players,
                channelId
            };
            this.broadcastToChannel(channelId, 'playerJoined', playerJoinedEvent);
            // Also emit chatChannelState for consistency
            const chatChannelState = {
                channelId,
                players: channel.players,
                lastUpdated: channel.lastUpdated
            };
            this.broadcastToChannel(channelId, 'chatChannelState', chatChannelState);
        }
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
        const channel = this.chatChannels.get(channelId);
        if (channel) {
            const wasInChannel = channel.players.includes(username);
            channel.players = channel.players.filter(p => p !== username);
            channel.lastUpdated = Date.now();
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
                this.broadcastToChannel(channelId, 'playerLeft', playerLeftEvent);
                // Also emit chatChannelState for consistency
                const chatChannelState = {
                    channelId,
                    players: channel.players,
                    lastUpdated: channel.lastUpdated
                };
                this.broadcastToChannel(channelId, 'chatChannelState', chatChannelState);
            }
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
    // Get service status
    getStatus() {
        return {
            activeChannels: this.chatChannels.size,
            connectedUsers: this.socketToUser.size,
            channels: Array.from(this.chatChannels.keys())
        };
    }
}
exports.default = ChatService;
//# sourceMappingURL=ChatService.js.map