import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import UserService from '../src/services/UserService';
import Logger from '../src/utils/Logger';

describe('UserService', () => {
  let userService: UserService;
  let io: SocketIOServer;
  let server: any;
  let logger: Logger;
  let mockSocket: any;

  beforeEach(() => {
    server = createServer();
    io = new SocketIOServer(server);
    logger = new Logger();
    userService = new UserService(io, logger);
    
    // Create mock socket
    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
      disconnect: jest.fn()
    };
    // Add mockSocket to io.sockets.sockets map
    (io.sockets.sockets as any).set && (io.sockets.sockets as any).set('test-socket-id', mockSocket);
  });

  afterEach(() => {
    server.close();
  });

  describe('handleConnection', () => {
    it('should handle new socket connection', () => {
      const loggerSpy = jest.spyOn(logger, 'info');
      userService.handleConnection(mockSocket);
      
      expect(loggerSpy).toHaveBeenCalledWith('New socket connection: test-socket-id');
    });
  });

  describe('registerUser', () => {
    it('should register a new user successfully', () => {
      const result = userService.registerUser(mockSocket, 'testuser');
      
      expect(result).toBe(true);
      expect(userService.getUserBySocket('test-socket-id')).toBe('testuser');
      expect(userService.isUserOnline('testuser')).toBe(true);
    });

    it('should return false for empty username', () => {
      const result = userService.registerUser(mockSocket, '');
      
      expect(result).toBe(false);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Username is required' });
    });

    it('should handle existing user connection by disconnecting old socket', () => {
      // Register first user
      userService.registerUser(mockSocket, 'testuser');
      
      // Create second socket for same user
      const mockSocket2: any = {
        id: 'test-socket-id-2',
        emit: jest.fn(),
        disconnect: jest.fn()
      };
      // Add mockSocket2 to io.sockets.sockets map
      (io.sockets.sockets as any).set && (io.sockets.sockets as any).set('test-socket-id-2', mockSocket2);
      
      const loggerSpy = jest.spyOn(logger, 'warn');
      const result = userService.registerUser(mockSocket2, 'testuser');
      
      expect(result).toBe(true);
      expect(loggerSpy).toHaveBeenCalledWith('User testuser already connected on socket test-socket-id');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('unregisterUser', () => {
    it('should unregister an existing user', () => {
      userService.registerUser(mockSocket, 'testuser');
      const result = userService.unregisterUser('testuser');
      
      expect(result).toBe(true);
      expect(userService.getUserBySocket('test-socket-id')).toBeUndefined();
      expect(userService.isUserOnline('testuser')).toBe(false);
    });

    it('should return false for non-existent user', () => {
      const result = userService.unregisterUser('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getUserBySocket', () => {
    it('should return username for existing socket', () => {
      userService.registerUser(mockSocket, 'testuser');
      expect(userService.getUserBySocket('test-socket-id')).toBe('testuser');
    });

    it('should return undefined for non-existent socket', () => {
      expect(userService.getUserBySocket('nonexistent')).toBeUndefined();
    });
  });

  describe('getSocketByUser', () => {
    it('should return socket for existing user', () => {
      userService.registerUser(mockSocket, 'testuser');
      // Ensure mockSocket is in io.sockets.sockets
      (io.sockets.sockets as any).set && (io.sockets.sockets as any).set('test-socket-id', mockSocket);
      const socket = userService.getSocketByUser('testuser');
      expect(socket).toBe(mockSocket);
    });

    it('should return null for non-existent user', () => {
      const socket = userService.getSocketByUser('nonexistent');
      expect(socket).toBeNull();
    });
  });

  describe('isUserOnline', () => {
    it('should return true for online user', () => {
      userService.registerUser(mockSocket, 'testuser');
      expect(userService.isUserOnline('testuser')).toBe(true);
    });

    it('should return false for offline user', () => {
      expect(userService.isUserOnline('testuser')).toBe(false);
    });
  });

  describe('getOnlineUsers', () => {
    it('should return array of online users', () => {
      userService.registerUser(mockSocket, 'user1');
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), disconnect: jest.fn() };
      userService.registerUser(mockSocket2, 'user2');
      
      const onlineUsers = userService.getOnlineUsers();
      expect(onlineUsers).toContain('user1');
      expect(onlineUsers).toContain('user2');
      expect(onlineUsers).toHaveLength(2);
    });

    it('should return empty array when no users online', () => {
      const onlineUsers = userService.getOnlineUsers();
      expect(onlineUsers).toEqual([]);
    });
  });

  describe('getUserSession', () => {
    it('should return session for existing user', () => {
      userService.registerUser(mockSocket, 'testuser');
      const session = userService.getUserSession('testuser');
      
      expect(session).toBeDefined();
      expect(session?.username).toBe('testuser');
      expect(session?.socketId).toBe('test-socket-id');
      expect(session?.isOnline).toBe(true);
    });

    it('should return undefined for non-existent user', () => {
      const session = userService.getUserSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('getAllSessions', () => {
    it('should return all user sessions', () => {
      userService.registerUser(mockSocket, 'user1');
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), disconnect: jest.fn() };
      userService.registerUser(mockSocket2, 'user2');
      
      const sessions = userService.getAllSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.username)).toContain('user1');
      expect(sessions.map(s => s.username)).toContain('user2');
    });
  });

  describe('getConnectedUsersCount', () => {
    it('should return correct count of connected users', () => {
      expect(userService.getConnectedUsersCount()).toBe(0);
      
      userService.registerUser(mockSocket, 'user1');
      expect(userService.getConnectedUsersCount()).toBe(1);
      
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), disconnect: jest.fn() };
      userService.registerUser(mockSocket2, 'user2');
      expect(userService.getConnectedUsersCount()).toBe(2);
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      userService.registerUser(mockSocket, 'user1');
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), disconnect: jest.fn() };
      userService.registerUser(mockSocket2, 'user2');
      
      const status = userService.getStatus();
      
      expect(status.connectedUsers).toBe(2);
      expect(status.totalSessions).toBe(2);
      expect(status.onlineUsers).toContain('user1');
      expect(status.onlineUsers).toContain('user2');
      expect(status.adminAccounts).toBeDefined();
    });
  });

  describe('handleDisconnection', () => {
    it('should handle user disconnection', () => {
      userService.registerUser(mockSocket, 'testuser');
      const loggerSpy = jest.spyOn(logger, 'info');
      
      userService.handleDisconnection(mockSocket);
      
      expect(loggerSpy).toHaveBeenCalledWith('User testuser disconnected');
      expect(userService.isUserOnline('testuser')).toBe(false);
    });

    it('should not handle disconnection for unknown socket', () => {
      const loggerSpy = jest.spyOn(logger, 'info');
      
      userService.handleDisconnection(mockSocket);
      
      expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('disconnected'));
    });
  });

  describe('cleanupOldSessions', () => {
    it('should clean up old sessions', () => {
      userService.registerUser(mockSocket, 'testuser');
      // Simulate user is offline
      userService.unregisterUser('testuser');
      // Mock Date.now to simulate old session
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 25 * 60 * 60 * 1000); // 25 hours later
      
      const loggerSpy = jest.spyOn(logger, 'info');
      userService.cleanupOldSessions();
      
      expect(loggerSpy).toHaveBeenCalledWith('Cleaned up 1 old sessions');
      
      // Restore Date.now
      Date.now = originalDateNow;
    });
  });
}); 