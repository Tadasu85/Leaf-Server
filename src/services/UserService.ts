import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
import { UserServiceInterface, UserSession, UserStatusEvent, UserServiceStatus, Logger } from '../types';
import config from '../config';

class UserService implements UserServiceInterface {
  private io: SocketIOServer;
  private logger: Logger;
  private connectedUsers: Map<string, string>; // Username -> Socket ID
  private socketToUser: Map<string, string>; // Socket ID -> Username
  private userSessions: Map<string, UserSession>; // Username -> Session Data

  constructor(io: SocketIOServer, logger: Logger) {
    this.io = io;
    this.logger = logger;
    this.connectedUsers = new Map();
    this.socketToUser = new Map();
    this.userSessions = new Map();
  }

  // Handle user connection
  handleConnection(socket: Socket): void {
    this.logger.info(`New socket connection: ${socket.id}`);
  }

  // Handle user disconnection
  handleDisconnection(socket: Socket): void {
    const username = this.socketToUser.get(socket.id);
    if (username) {
      this.logger.info(`User ${username} disconnected`);
      
      // Remove from tracking
      this.connectedUsers.delete(username);
      this.socketToUser.delete(socket.id);
      
      // Update session
      const session = this.userSessions.get(username);
      if (session) {
        session.lastSeen = Date.now();
        session.isOnline = false;
      }
      
      // Broadcast user offline
      this.broadcastUserStatus(username, false);
    }
  }

  // Register user
  registerUser(socket: Socket, username: string): boolean {
    if (!username) {
      socket.emit('error', { message: 'Username is required' });
      return false;
    }

    // Check if user is already connected
    const existingSocketId = this.connectedUsers.get(username);
    if (existingSocketId && existingSocketId !== socket.id) {
      this.logger.warn(`User ${username} already connected on socket ${existingSocketId}`);
      // Disconnect existing connection
      const existingSocket = this.io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.disconnect();
      }
    }

    // Register user
    this.connectedUsers.set(username, socket.id);
    this.socketToUser.set(socket.id, username);
    
    // Create or update session
    const session: UserSession = {
      username,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: true,
      socketId: socket.id
    };
    this.userSessions.set(username, session);
    
    this.logger.info(`User ${username} registered on socket ${socket.id}`);
    
    // Broadcast user online
    this.broadcastUserStatus(username, true);
    
    return true;
  }

  // Unregister user
  unregisterUser(username: string): boolean {
    const socketId = this.connectedUsers.get(username);
    if (socketId) {
      this.connectedUsers.delete(username);
      this.socketToUser.delete(socketId);
      
      // Update session
      const session = this.userSessions.get(username);
      if (session) {
        session.lastSeen = Date.now();
        session.isOnline = false;
      }
      
      this.logger.info(`User ${username} unregistered`);
      return true;
    }
    return false;
  }

  // Get user by socket
  getUserBySocket(socketId: string): string | undefined {
    return this.socketToUser.get(socketId);
  }

  // Get socket by user
  getSocketByUser(username: string): Socket | null {
    const socketId = this.connectedUsers.get(username);
    return socketId ? this.io.sockets.sockets.get(socketId) || null : null;
  }

  // Check if user is online
  isUserOnline(username: string): boolean {
    return this.connectedUsers.has(username);
  }

  // Get online users
  getOnlineUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  // Get user session
  getUserSession(username: string): UserSession | undefined {
    return this.userSessions.get(username);
  }

  // Get all sessions
  getAllSessions(): UserSession[] {
    return Array.from(this.userSessions.values());
  }

  // Filter admin accounts
  filterAdminAccounts(users: string[]): string[] {
    return users.filter(user => !config.admins.includes(user));
  }

  // Broadcast user status
  broadcastUserStatus(username: string, isOnline: boolean): void {
    const event: UserStatusEvent = {
      username,
      isOnline,
      timestamp: Date.now()
    };
    this.io.emit('userStatus', event);
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Get service status
  getStatus(): UserServiceStatus {
    return {
      connectedUsers: this.connectedUsers.size,
      totalSessions: this.userSessions.size,
      onlineUsers: this.getOnlineUsers(),
      adminAccounts: config.admins
    };
  }

  // Clean up old sessions (optional)
  cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [username, session] of this.userSessions.entries()) {
      if (now - session.lastSeen > maxAge && !this.isUserOnline(username)) {
        toDelete.push(username);
      }
    }
    
    toDelete.forEach(username => {
      this.userSessions.delete(username);
    });
    
    if (toDelete.length > 0) {
      this.logger.info(`Cleaned up ${toDelete.length} old sessions`);
    }
  }
}

export default UserService; 