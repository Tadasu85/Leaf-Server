import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import ChatService from '../src/services/ChatService';
import Logger from '../src/utils/Logger';

describe('ChatService', () => {
  let chatService: ChatService;
  let io: SocketIOServer;
  let server: any;
  let logger: Logger;
  let mockSocket: any;

  beforeEach(() => {
    server = createServer();
    io = new SocketIOServer(server);
    logger = new Logger();
    chatService = new ChatService(io, logger);
    
    // Create mock socket
    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      rooms: new Set(['test-socket-id'])
    };
    
    // Mock the socket.rooms behavior for channel tracking
    mockSocket.join = jest.fn((channelId: string) => {
      mockSocket.rooms.add(channelId);
    });
    mockSocket.leave = jest.fn((channelId: string) => {
      mockSocket.rooms.delete(channelId);
    });
  });

  afterEach(() => {
    server.close();
  });

  describe('handleConnection', () => {
    it('should handle new socket connection', () => {
      // This method is currently empty, just testing it doesn't throw
      expect(() => chatService.handleConnection(mockSocket)).not.toThrow();
    });
  });

  describe('joinChannel', () => {
    it('should join a chat channel successfully', () => {
      const data = { channelId: 'test-channel', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.joinChannel(mockSocket, data);
      
      expect(mockSocket.join).toHaveBeenCalledWith('test-channel');
      expect(loggerSpy).toHaveBeenCalledWith('User testuser joined chat channel test-channel');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeDefined();
      expect(channelInfo?.players).toContain('testuser');
    });

    it('should handle missing channelId or username', () => {
      const data = { channelId: '', username: 'testuser' };
      
      chatService.joinChannel(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should not add duplicate user to channel', () => {
      const data = { channelId: 'test-channel', username: 'testuser' };
      
      // Join twice
      chatService.joinChannel(mockSocket, data);
      chatService.joinChannel(mockSocket, data);
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo?.players).toHaveLength(1);
      expect(channelInfo?.players).toContain('testuser');
    });
  });

  describe('leaveChannel', () => {
    it('should leave a chat channel successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.leaveChannel(mockSocket, data);
      
      expect(mockSocket.leave).toHaveBeenCalledWith('test-channel');
      expect(loggerSpy).toHaveBeenCalledWith('User testuser left chat channel test-channel');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      // Channel should be cleaned up when empty
      expect(channelInfo).toBeNull();
    });

    it('should handle missing channelId or username', () => {
      const data = { channelId: '', username: 'testuser' };
      
      chatService.leaveChannel(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });
  });

  describe('handleMessage', () => {
    it('should handle chat message successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', message: 'Hello world', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleMessage(mockSocket, data);
      
      expect(loggerSpy).toHaveBeenCalledWith('Chat message from testuser in test-channel: Hello world');
    });

    it('should handle missing required fields', () => {
      const data = { channelId: 'test-channel', message: '', username: 'testuser' };
      
      chatService.handleMessage(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle message from user not in channel', () => {
      const data = { channelId: 'test-channel', message: 'Hello world', username: 'testuser' };
      
      chatService.handleMessage(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in channel' });
    });
  });

  describe('handleEmote', () => {
    it('should handle emote successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', emote: 'wave', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleEmote(mockSocket, data);
      
      expect(loggerSpy).toHaveBeenCalledWith('Emote from testuser in test-channel: wave');
    });

    it('should handle missing required fields', () => {
      const data = { channelId: 'test-channel', emote: '', username: 'testuser' };
      
      chatService.handleEmote(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle emote from user not in channel', () => {
      const data = { channelId: 'test-channel', emote: 'wave', username: 'testuser' };
      
      chatService.handleEmote(mockSocket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in channel' });
    });
  });

  describe('getChannelInfo', () => {
    it('should return channel info for existing channel', () => {
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      
      expect(channelInfo).toBeDefined();
      expect(channelInfo?.players).toContain('testuser');
      expect(channelInfo?.lastUpdated).toBeDefined();
    });

    it('should return null for non-existent channel', () => {
      const channelInfo = chatService.getChannelInfo('nonexistent');
      expect(channelInfo).toBeNull();
    });
  });

  describe('getAllChannels', () => {
    it('should return all channels', () => {
      chatService.joinChannel(mockSocket, { channelId: 'channel1', username: 'user1' });
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), join: jest.fn(), leave: jest.fn(), rooms: new Set(['socket2']) };
      chatService.joinChannel(mockSocket2, { channelId: 'channel2', username: 'user2' });
      
      const channels = chatService.getAllChannels();
      
      expect(channels).toHaveLength(2);
      expect(channels.map(([id]) => id)).toContain('channel1');
      expect(channels.map(([id]) => id)).toContain('channel2');
    });

    it('should return empty array when no channels', () => {
      const channels = chatService.getAllChannels();
      expect(channels).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      chatService.joinChannel(mockSocket, { channelId: 'channel1', username: 'user1' });
      const mockSocket2: any = { id: 'socket2', emit: jest.fn(), join: jest.fn(), leave: jest.fn(), rooms: new Set(['socket2']) };
      chatService.joinChannel(mockSocket2, { channelId: 'channel2', username: 'user2' });
      
      const status = chatService.getStatus();
      
      expect(status.activeChannels).toBe(2);
      expect(status.connectedUsers).toBe(2);
      expect(status.channels).toContain('channel1');
      expect(status.channels).toContain('channel2');
    });
  });

  describe('handleDisconnection', () => {
    it('should handle user disconnection from chat', () => {
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleDisconnection(mockSocket);
      
      expect(loggerSpy).toHaveBeenCalledWith('User testuser disconnected from chat');
      
      // User should be removed from channel
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeNull(); // Channel gets cleaned up when empty
    });

    it('should clean up empty channels on disconnection', () => {
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'testuser' });
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleDisconnection(mockSocket);
      
      expect(loggerSpy).toHaveBeenCalledWith('Cleaned up empty chat channel: test-channel');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeNull();
    });
  });
}); 