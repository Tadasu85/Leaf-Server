"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
class UserService {
    constructor(io, logger) {
        this.io = io;
        this.logger = logger;
        this.connectedUsers = new Map();
        this.socketToUser = new Map();
        this.userSessions = new Map();
    }
    // Handle user connection
    handleConnection(socket) {
        this.logger.info(`New socket connection: ${socket.id}`);
    }
    // Handle user disconnection
    handleDisconnection(socket) {
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
    registerUser(socket, username) {
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
        const session = {
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
    unregisterUser(username) {
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
    getUserBySocket(socketId) {
        return this.socketToUser.get(socketId);
    }
    // Get socket by user
    getSocketByUser(username) {
        const socketId = this.connectedUsers.get(username);
        return socketId ? this.io.sockets.sockets.get(socketId) || null : null;
    }
    // Check if user is online
    isUserOnline(username) {
        return this.connectedUsers.has(username);
    }
    // Get online users
    getOnlineUsers() {
        return Array.from(this.connectedUsers.keys());
    }
    // Get user session
    getUserSession(username) {
        return this.userSessions.get(username);
    }
    // Get all sessions
    getAllSessions() {
        return Array.from(this.userSessions.values());
    }
    // Filter admin accounts
    filterAdminAccounts(users) {
        return users.filter(user => !config_1.default.admins.includes(user));
    }
    // Broadcast user status
    broadcastUserStatus(username, isOnline) {
        const event = {
            username,
            isOnline,
            timestamp: Date.now()
        };
        this.io.emit('userStatus', event);
    }
    // Get connected users count
    getConnectedUsersCount() {
        return this.connectedUsers.size;
    }
    // Get service status
    getStatus() {
        return {
            connectedUsers: this.connectedUsers.size,
            totalSessions: this.userSessions.size,
            onlineUsers: this.getOnlineUsers(),
            adminAccounts: config_1.default.admins
        };
    }
    // Clean up old sessions (optional)
    cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        const toDelete = [];
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
exports.default = UserService;
//# sourceMappingURL=UserService.js.map