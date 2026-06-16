import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
import { 
  ChatServiceInterface, 
  ChatChannel, 
  ChatMessage, 
  EmoteMessage, 
  PlayerJoinedEvent, 
  PlayerLeftEvent, 
  ChatChannelState, 
  ChatServiceStatus, 
  Logger,
  JoinChatChannelData,
  LeaveChatChannelData,
  ChatMessageData,
  EmoteData,
  KeepaliveData
} from '../types';

class ChatService implements ChatServiceInterface {
  private io: SocketIOServer;
  private logger: Logger;
  private chatChannels: Map<string, ChatChannel>; // Channel ID -> Channel Data
  private socketToUser: Map<string, string>; // Socket ID -> Username
  private userToSocket: Map<string, string>; // Username -> Socket ID
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Keepalive tracking
  private keepaliveRequests: Map<string, { timestamp: number; timeoutId: NodeJS.Timeout }> = new Map(); // Username -> keepalive data
  private keepaliveTimeout: number = 10000; // 10 seconds to respond to keepalive
  private keepaliveCheckInterval: number = 300000; // 5 minutes between cleanup checks

  constructor(io: SocketIOServer, logger: Logger) {
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
    } else {
      this.logger.info(`[ChatService] Skipping cleanup interval setup in test environment`);
    }
  }

  // Handle user connection
  handleConnection(_socket: Socket): void {
    // Socket will be associated with user when they join a channel
  }

  // Handle user disconnection
  handleDisconnection(socket: Socket): void {
    const username = this.socketToUser.get(socket.id);
    if (username) {
      this.logger.info(`User ${username} disconnected from chat`);
      this.logger.debug(`[ChatService] Removing user ${username} from channels: ${JSON.stringify(Array.from(socket.rooms).filter(r => r !== socket.id))}`);
      this.socketToUser.delete(socket.id);
      this.userToSocket.delete(username);
      
      // Clear any pending keepalive requests for this user
      this.clearKeepaliveRequest(username);
      
      // Remove user from all chat channels
      const userChannels = Array.from(socket.rooms).filter(r => r !== socket.id);
      userChannels.forEach(channelId => {
        this.logger.debug(`[ChatService] Removing ${username} from channel ${channelId}`);
        this.removeUserFromChannel(channelId, username);
      });
    } else {
      this.logger.debug(`[ChatService] Socket ${socket.id} disconnected but no username found`);
    }
  }

  // Send keepalive request to a user
  private sendKeepaliveRequest(username: string): void {
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
    const keepaliveData: KeepaliveData = { timestamp: Date.now() };
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
  handleKeepaliveResponse(socket: Socket): void {
    const username = this.socketToUser.get(socket.id);
    if (!username) {
      this.logger.warn(`[ChatService] Keepalive response from unknown socket ${socket.id}`);
      return;
    }

    this.clearKeepaliveRequest(username);
    this.logger.info(`[ChatService] Received keepalive response from ${username}`);
  }

  // Handle keepalive timeout (no response received)
  private handleKeepaliveTimeout(username: string): void {
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
  private clearKeepaliveRequest(username: string): void {
    const keepaliveData = this.keepaliveRequests.get(username);
    if (keepaliveData) {
      clearTimeout(keepaliveData.timeoutId);
      this.keepaliveRequests.delete(username);
    }
  }

  // Get all channels a user is in
  private getChannelsForUser(username: string): string[] {
    const channels: string[] = [];
    for (const [channelId, channel] of this.chatChannels.entries()) {
      if (channel.players.includes(username)) {
        channels.push(channelId);
      }
    }
    return channels;
  }

  // Join a chat channel
  joinChannel(socket: Socket, data: JoinChatChannelData & { username: string }): void {
    this.logger.debug(`[ChatService] joinChannel: username=${data.username}, channelId=${data.channelId}`);
    
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
    
    const channel = this.chatChannels.get(channelId)!;
    
    // Clean up any stale entries - remove players who are no longer connected
    const connectedPlayers = Array.from(this.userToSocket.keys());
    const oldPlayers = [...channel.players];
    channel.players = channel.players.filter(player => connectedPlayers.includes(player));

    const removedPlayers = oldPlayers.filter(player => !connectedPlayers.includes(player));
    if (removedPlayers.length > 0) {
      this.logger.debug(`[ChatService] Cleaned up disconnected players: ${JSON.stringify(removedPlayers)}`);
    }

    const wasAlreadyInChannel = channel.players.includes(username);
    this.logger.debug(`[ChatService] User ${username} joining channel ${channelId}, players: ${JSON.stringify(channel.players)}`);
    
    if (!wasAlreadyInChannel) {
      channel.players.push(username);
      channel.lastUpdated = Date.now();

      const playerJoinedEvent: PlayerJoinedEvent = { username, players: channel.players, channelId };
      socket.to(channelId).emit('playerJoined', playerJoinedEvent);
    }

    // Always send current channel state to the joining player
    const chatChannelState: ChatChannelState = {
      channelId,
      players: channel.players,
      lastUpdated: channel.lastUpdated
    };
    socket.emit('chatChannelState', chatChannelState);

    this.logger.info(`User ${username} joined chat channel ${channelId}`);
  }

  // Leave a chat channel
  leaveChannel(socket: Socket, data: LeaveChatChannelData): void {
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
  handleMessage(socket: Socket, data: ChatMessageData & { username: string }): void {
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
    const chatMessage: ChatMessage = {
      username,
      message,
      timestamp: Date.now(),
      channelId
    };
    this.broadcastToChannel(channelId, 'chatMessage', chatMessage);
    
    this.logger.info(`Chat message from ${username} in ${channelId}: ${message}`);
  }

  // Handle emote
  handleEmote(socket: Socket, data: EmoteData & { username: string }): void {
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
    const emoteMessage: EmoteMessage = {
      username,
      emote,
      timestamp: Date.now(),
      channelId
    };
    this.broadcastToChannel(channelId, 'emote', emoteMessage);
    
    this.logger.info(`Emote from ${username} in ${channelId}: ${emote}`);
  }

  // Remove user from channel
  private removeUserFromChannel(channelId: string, username: string): void {
    const channel = this.chatChannels.get(channelId);
    if (!channel) return;

    const wasInChannel = channel.players.includes(username);
    channel.players = channel.players.filter(p => p !== username);
    channel.lastUpdated = Date.now();

    if (channel.players.length === 0) {
      this.chatChannels.delete(channelId);
      this.logger.info(`Cleaned up empty chat channel: ${channelId}`);
    } else if (wasInChannel) {
      const playerLeftEvent: PlayerLeftEvent = { username, players: channel.players, channelId };
      this.broadcastToChannel(channelId, 'playerLeft', playerLeftEvent);

      const chatChannelState: ChatChannelState = {
        channelId,
        players: channel.players,
        lastUpdated: channel.lastUpdated
      };
      this.broadcastToChannel(channelId, 'chatChannelState', chatChannelState);
    }
  }

  // Broadcast to channel
  private broadcastToChannel(channelId: string, event: string, data: any): void {
    this.logger.debug(`Broadcasting ${event} to ${channelId}:`, data);
    this.io.to(channelId).emit(event, data);
  }

  // Get channel info
  getChannelInfo(channelId: string): ChatChannel | null {
    return this.chatChannels.get(channelId) || null;
  }

  // Get all channels
  getAllChannels(): [string, ChatChannel][] {
    return Array.from(this.chatChannels.entries());
  }

  // Clean up stale players from all channels using keepalive system
  private cleanupStalePlayers(): void {
    const connectedPlayers = Array.from(this.userToSocket.keys());
    let keepaliveSent = 0;

    for (const [_channelId, channel] of this.chatChannels.entries()) {
      const stalePlayers = channel.players.filter(player => !connectedPlayers.includes(player));

      stalePlayers.forEach(player => {
        if (!this.keepaliveRequests.has(player)) {
          this.sendKeepaliveRequest(player);
          keepaliveSent++;
        }
      });
    }

    if (keepaliveSent > 0) {
      this.logger.info(`[ChatService] Sent keepalive requests to ${keepaliveSent} potentially stale players`);
    }
  }

  // Get service status
  getStatus(): ChatServiceStatus {
    return {
      activeChannels: this.chatChannels.size,
      connectedUsers: this.socketToUser.size,
      channels: Array.from(this.chatChannels.keys())
    };
  }

  // Cleanup method to stop intervals and clear data
  cleanup(): void {
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

export default ChatService; 