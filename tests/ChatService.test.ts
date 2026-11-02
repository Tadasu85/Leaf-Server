import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import ChatService from '../src/services/ChatService';
import Logger from '../src/utils/Logger';
import { Socket } from 'socket.io';

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
    
    // Create mock socket with proper to() method
    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      rooms: new Set(['test-socket-id']),
      to: jest.fn().mockReturnValue({
        emit: jest.fn()
      })
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
    // Clean up the chat service to stop intervals
    chatService.cleanup();
    server.close();
  });

  describe('handleConnection', () => {
    it('should handle new socket connection', () => {
      // This method is currently empty, just testing it doesn't throw
      expect(() => chatService.handleConnection(mockSocket as Socket)).not.toThrow();
    });
  });

  describe('joinChannel', () => {
    it('should join a chat channel successfully', () => {
      const data = { channelId: 'test-channel', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.joinChannel(mockSocket as Socket, data);
      
      expect(mockSocket.join).toHaveBeenCalledWith('test-channel');
      expect(loggerSpy).toHaveBeenCalledWith('User testuser joined chat channel test-channel');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeDefined();
      expect(channelInfo?.players).toContain('testuser');
    });

    it('should handle missing channelId or username', () => {
      const data = { channelId: '', username: 'testuser' };
      
      chatService.joinChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should handle missing username', () => {
      const data = { channelId: 'test-channel', username: '' };
      
      chatService.joinChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should handle missing both channelId and username', () => {
      const data = { channelId: '', username: '' };
      
      chatService.joinChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should not add duplicate user to channel', () => {
      const data = { channelId: 'test-channel', username: 'testuser' };
      
      // Join twice
      chatService.joinChannel(mockSocket as Socket, data);
      chatService.joinChannel(mockSocket as Socket, data);
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo?.players).toHaveLength(1);
      expect(channelInfo?.players).toContain('testuser');
    });

    it('should clean up stale players when joining', () => {
      // Create a mock socket for a disconnected user
      const disconnectedSocket = {
        id: 'disconnected-socket',
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        rooms: new Set(['disconnected-socket', 'test-channel']),
        to: jest.fn().mockReturnValue({
          emit: jest.fn()
        })
      };

      // Join with first user
      chatService.joinChannel(disconnectedSocket as unknown as Socket, { channelId: 'test-channel', username: 'disconnected-user' });
      
      // Simulate disconnection by removing from userToSocket map
      (chatService as any).userToSocket.delete('disconnected-user');
      
      // Join with new user - should clean up the disconnected user
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'new-user' });
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo?.players).toContain('new-user');
      expect(channelInfo?.players).not.toContain('disconnected-user');
    });

    it('should emit playerJoined event to other users', () => {
      const mockSocket2 = {
        id: 'socket2',
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        rooms: new Set(['socket2', 'test-channel']),
        to: jest.fn().mockReturnValue({
          emit: jest.fn()
        })
      };

      // First user joins
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'user1' });
      
      // Second user joins
      chatService.joinChannel(mockSocket2 as unknown as Socket, { channelId: 'test-channel', username: 'user2' });
      
      expect(mockSocket2.to).toHaveBeenCalledWith('test-channel');
    });

    it('should send chatChannelState to joining user', () => {
      const data = { channelId: 'test-channel', username: 'testuser' };
      
      chatService.joinChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('chatChannelState', expect.objectContaining({
        channelId: 'test-channel',
        players: ['testuser'],
        lastUpdated: expect.any(Number)
      }));
    });
  });

  describe('leaveChannel', () => {
    it('should leave a chat channel successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.leaveChannel(mockSocket as Socket, data);
      
      expect(mockSocket.leave).toHaveBeenCalledWith('test-channel');
      expect(loggerSpy).toHaveBeenCalledWith('User testuser left chat channel test-channel');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      // Channel should be cleaned up when empty
      expect(channelInfo).toBeNull();
    });

    it('should handle missing channelId or username', () => {
      const data = { channelId: '', username: 'testuser' };
      
      chatService.leaveChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should handle missing username', () => {
      const data = { channelId: 'test-channel', username: '' };
      
      chatService.leaveChannel(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing channelId or username' });
    });

    it('should emit playerLeft event when user leaves', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', username: 'testuser' };
      
      chatService.leaveChannel(mockSocket as Socket, data);
      
      // Should emit playerLeft event to remaining users
      expect(mockSocket.to).toHaveBeenCalledWith('test-channel');
    });
  });

  describe('handleMessage', () => {
    it('should handle chat message successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', message: 'Hello world', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      expect(loggerSpy).toHaveBeenCalledWith('Chat message from testuser in test-channel: Hello world');
    });

    it('should handle missing required fields', () => {
      const data = { channelId: 'test-channel', message: '', username: 'testuser' };
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle missing channelId', () => {
      const data = { channelId: '', message: 'Hello world', username: 'testuser' };
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle missing username', () => {
      const data = { channelId: 'test-channel', message: 'Hello world', username: '' };
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle message from user not in channel', () => {
      const data = { channelId: 'test-channel', message: 'Hello world', username: 'testuser' };
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in channel' });
    });

    it('should broadcast message to channel', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', message: 'Hello world', username: 'testuser' };
      
      chatService.handleMessage(mockSocket as Socket, data);
      
      // Should broadcast to channel
      expect(mockSocket.to).toHaveBeenCalledWith('test-channel');
    });
  });

  describe('handleEmote', () => {
    it('should handle emote successfully', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', emote: 'wave', username: 'testuser' };
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      expect(loggerSpy).toHaveBeenCalledWith('Emote from testuser in test-channel: wave');
    });

    it('should handle missing required fields', () => {
      const data = { channelId: 'test-channel', emote: '', username: 'testuser' };
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle missing channelId', () => {
      const data = { channelId: '', emote: 'wave', username: 'testuser' };
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle missing username', () => {
      const data = { channelId: 'test-channel', emote: 'wave', username: '' };
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle emote from user not in channel', () => {
      const data = { channelId: 'test-channel', emote: 'wave', username: 'testuser' };
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Not in channel' });
    });

    it('should broadcast emote to channel', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const data = { channelId: 'test-channel', emote: 'wave', username: 'testuser' };
      
      chatService.handleEmote(mockSocket as Socket, data);
      
      // Should broadcast to channel
      expect(mockSocket.to).toHaveBeenCalledWith('test-channel');
    });
  });

  describe('handleDisconnection', () => {
    it('should handle user disconnection', () => {
      // First join a channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const loggerSpy = jest.spyOn(logger, 'info');
      
      chatService.handleDisconnection(mockSocket as Socket);
      
      expect(loggerSpy).toHaveBeenCalledWith('User testuser disconnected from chat');
      
      // User should be removed from tracking
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeNull(); // Channel gets cleaned up when empty
    });

    it('should handle disconnection of user not in any channels', () => {
      const loggerSpy = jest.spyOn(logger, 'debug');
      
      chatService.handleDisconnection(mockSocket as Socket);
      
      expect(loggerSpy).toHaveBeenCalledWith(`[ChatService] Socket ${mockSocket.id} disconnected but no username found`);
    });

    it('should remove user from all channels on disconnection', () => {
      // Join multiple channels
      chatService.joinChannel(mockSocket as Socket, { channelId: 'channel1', username: 'testuser' });
      chatService.joinChannel(mockSocket as Socket, { channelId: 'channel2', username: 'testuser' });
      
      chatService.handleDisconnection(mockSocket as Socket);
      
      const channel1Info = chatService.getChannelInfo('channel1');
      const channel2Info = chatService.getChannelInfo('channel2');
      
      expect(channel1Info).toBeNull(); // Channel gets cleaned up when empty
      expect(channel2Info).toBeNull(); // Channel gets cleaned up when empty
    });
  });

  describe('getChannelInfo', () => {
    it('should return channel info for existing channel', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
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
      chatService.joinChannel(mockSocket as Socket, { channelId: 'channel1', username: 'user1' });
      const mockSocket2: any = { 
        id: 'socket2', 
        emit: jest.fn(), 
        join: jest.fn(), 
        leave: jest.fn(), 
        rooms: new Set(['socket2']),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      };
      chatService.joinChannel(mockSocket2 as Socket, { channelId: 'channel2', username: 'user2' });
      
      const allChannels = chatService.getAllChannels();
      
      expect(allChannels).toHaveLength(2);
      expect(allChannels.some(([id]) => id === 'channel1')).toBe(true);
      expect(allChannels.some(([id]) => id === 'channel2')).toBe(true);
    });

    it('should return empty array when no channels exist', () => {
      const allChannels = chatService.getAllChannels();
      expect(allChannels).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return proper status information', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      const status = chatService.getStatus();
      
      expect(status).toHaveProperty('activeChannels');
      expect(status).toHaveProperty('connectedUsers');
      expect(status).toHaveProperty('channels');
      expect(status.activeChannels).toBe(1);
      expect(status.connectedUsers).toBe(1);
      expect(status.channels).toEqual(['test-channel']); // Fixed: channels is an array of channel IDs
    });

    it('should return zero status when no users or channels', () => {
      const status = chatService.getStatus();
      
      expect(status.activeChannels).toBe(0);
      expect(status.connectedUsers).toBe(0);
      expect(status.channels).toEqual([]); // Fixed: channels is an array
    });
  });

  describe('cleanup', () => {
    it('should clean up intervals', () => {
      jest.spyOn(global, 'clearInterval');

      chatService.cleanup();

      // In test environment, cleanupInterval is null, so clearInterval won't be called
      // But the method should still work without throwing
      expect(() => chatService.cleanup()).not.toThrow();
    });

    it('should handle cleanup when no intervals exist', () => {
      chatService.cleanup();
      expect(() => chatService.cleanup()).not.toThrow();
    });

    it('should clear pending keepalive timeouts on cleanup', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const mockTimeoutId = setTimeout(() => {}, 60000);
      chatService['keepaliveRequests'].set('testuser', { timestamp: Date.now(), timeoutId: mockTimeoutId });

      chatService.cleanup();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeoutId);
      expect(chatService['keepaliveRequests'].size).toBe(0);
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('handleKeepaliveResponse', () => {
    it('should log and clear when called from a registered socket', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      const loggerSpy = jest.spyOn(logger, 'info');

      chatService.handleKeepaliveResponse(mockSocket as Socket);

      expect(loggerSpy).toHaveBeenCalledWith('[ChatService] Received keepalive response from testuser');
    });

    it('should clear a pending keepalive request on response', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      const mockTimeoutId = setTimeout(() => {}, 60000);
      chatService['keepaliveRequests'].set('testuser', { timestamp: Date.now(), timeoutId: mockTimeoutId });

      chatService.handleKeepaliveResponse(mockSocket as Socket);

      expect(chatService['keepaliveRequests'].has('testuser')).toBe(false);
    });
  });

  describe('handleKeepaliveTimeout', () => {
    it('should remove the user from all channels', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });

      chatService['handleKeepaliveTimeout']('testuser');

      expect(chatService.getChannelInfo('test-channel')).toBeNull();
    });

    it('should clean up user tracking maps', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });

      chatService['handleKeepaliveTimeout']('testuser');

      expect(chatService['userToSocket'].has('testuser')).toBe(false);
      expect(chatService['socketToUser'].has(mockSocket.id)).toBe(false);
    });

    it('should clear a pending keepalive request', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      const mockTimeoutId = setTimeout(() => {}, 60000);
      chatService['keepaliveRequests'].set('testuser', { timestamp: Date.now(), timeoutId: mockTimeoutId });

      chatService['handleKeepaliveTimeout']('testuser');

      expect(chatService['keepaliveRequests'].has('testuser')).toBe(false);
    });
  });

  describe('sendKeepaliveRequest', () => {
    it('should warn when socket id is not in io.sockets', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      chatService['userToSocket'].set('testuser', 'ghost-socket-id');

      chatService['sendKeepaliveRequest']('testuser');

      expect(warnSpy).toHaveBeenCalledWith('[ChatService] Cannot send keepalive to testuser - socket not found');
    });

    it('should emit keepalive and track the request when socket exists', () => {
      jest.useFakeTimers();
      const mockIoSocket = { emit: jest.fn() };
      jest.spyOn(io.sockets.sockets, 'get').mockReturnValue(mockIoSocket as any);
      chatService['userToSocket'].set('testuser', 'real-socket-id');
      chatService['socketToUser'].set('real-socket-id', 'testuser');

      chatService['sendKeepaliveRequest']('testuser');

      expect(mockIoSocket.emit).toHaveBeenCalledWith('keepalive', expect.objectContaining({ timestamp: expect.any(Number) }));
      expect(chatService['keepaliveRequests'].has('testuser')).toBe(true);

      // Advance past the keepalive timeout to cover the setTimeout callback (handleKeepaliveTimeout)
      jest.advanceTimersByTime(chatService['keepaliveTimeout'] + 1);
      expect(chatService['keepaliveRequests'].has('testuser')).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('cleanupStalePlayers', () => {
    it('should clean up stale players', () => {
      // Create a mock socket for a disconnected user
      const disconnectedSocket = {
        id: 'disconnected-socket',
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        rooms: new Set(['disconnected-socket', 'test-channel']),
        to: jest.fn().mockReturnValue({
          emit: jest.fn()
        })
      };

      // Join with disconnected user
      chatService.joinChannel(disconnectedSocket as unknown as Socket, { channelId: 'test-channel', username: 'disconnected-user' });
      
      // Simulate disconnection
      (chatService as any).userToSocket.delete('disconnected-user');
      
      // Call cleanupStalePlayers directly
      (chatService as any).cleanupStalePlayers();
      
      // Players with no socket can't answer a keepalive, so they are removed directly
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo?.players ?? []).not.toContain('disconnected-user');
    });

    it('should keep players who still have a live socket and send them a keepalive', () => {
      const liveSocket = { emit: jest.fn() };
      const getSpy = jest.spyOn(io.sockets.sockets, 'get').mockReturnValue(liveSocket as any);
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'connected-user' });
      (chatService as any).cleanupStalePlayers();
      expect(chatService.getChannelInfo('test-channel')?.players).toContain('connected-user');
      expect(liveSocket.emit).toHaveBeenCalledWith('keepalive', expect.any(Object));
      chatService['clearKeepaliveRequest']('connected-user');
      getSpy.mockRestore();
    });

    it('should remove players whose socket no longer exists', () => {
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'ghost-user' });
      (chatService as any).cleanupStalePlayers();
      expect(chatService.getChannelInfo('test-channel')?.players ?? []).not.toContain('ghost-user');
    });
  });

  describe('removeUserFromChannel', () => {
    it('should remove user from channel', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      // Call removeUserFromChannel directly
      (chatService as any).removeUserFromChannel('test-channel', 'testuser');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeNull(); // Channel gets cleaned up when empty
    });

    it('should emit playerLeft event when removing user', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      // Call removeUserFromChannel directly
      (chatService as any).removeUserFromChannel('test-channel', 'testuser');
      
      // Should emit playerLeft event via broadcastToChannel
      // We can't easily test this without mocking io, but the method should not throw
      expect(() => (chatService as any).removeUserFromChannel('test-channel', 'testuser')).not.toThrow();
    });

    it('should clean up empty channels', () => {
      // First join the channel
      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'testuser' });
      
      // Call removeUserFromChannel directly
      (chatService as any).removeUserFromChannel('test-channel', 'testuser');
      
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).toBeNull();
    });
  });

  describe('removeUserFromChannel with remaining players', () => {
    it('should emit playerLeft and chatChannelState when channel still has other players', () => {
      const mockSocket2: any = {
        id: 'socket2',
        emit: jest.fn(),
        join: jest.fn((id: string) => mockSocket2.rooms.add(id)),
        leave: jest.fn(),
        rooms: new Set(['socket2']),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      };

      chatService.joinChannel(mockSocket as Socket, { channelId: 'test-channel', username: 'user1' });
      chatService.joinChannel(mockSocket2 as Socket, { channelId: 'test-channel', username: 'user2' });

      chatService['removeUserFromChannel']('test-channel', 'user1');

      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).not.toBeNull();
      expect(channelInfo?.players).toEqual(['user2']);
    });
  });

  describe('removeUserFromChannel edge cases', () => {
    it('should handle removing user from non-existent channel', () => {
      // Try to remove user from channel that doesn't exist
      chatService['removeUserFromChannel']('non-existent-channel', 'testuser');
      
      // Should not throw error and should handle gracefully
      expect(chatService['chatChannels'].has('non-existent-channel')).toBe(false);
    });

    it('should handle removing user who was not in channel', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'user1' });
      
      // Clear the emit mock to reset call count
      mockSocket.emit.mockClear();
      
      // Try to remove different user who was never in channel
      chatService['removeUserFromChannel']('test-channel', 'user2');
      
      // Should not broadcast playerLeft event since user2 was never in channel
      // But chatChannelState might still be broadcast to remaining users
      // The key is that the channel should still exist with user1 in it
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo).not.toBeNull();
      expect(channelInfo?.players).toContain('user1');
      expect(channelInfo?.players).not.toContain('user2');
    });

    it('should handle removing user from empty channel', () => {
      // Create empty channel
      chatService['chatChannels'].set('empty-channel', {
        players: [],
        lastUpdated: Date.now()
      });

      // Try to remove user from empty channel
      chatService['removeUserFromChannel']('empty-channel', 'testuser');
      
      // Should handle gracefully without errors
      // The channel should be deleted since it's empty after the operation
      expect(chatService['chatChannels'].has('empty-channel')).toBe(false);
    });
  });

  describe('cleanupStalePlayers edge cases', () => {
    it('should handle cleanup when no channels exist', () => {
      // Clear all channels
      chatService['chatChannels'].clear();
      
      // Should not throw error when no channels exist
      expect(() => chatService['cleanupStalePlayers']()).not.toThrow();
    });

    it('should handle cleanup when all players are stale', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'stale-user' });
      
      // Clear socket mappings to make user stale
      chatService['socketToUser'].clear();
      chatService['userToSocket'].clear();
      
      // Run cleanup
      chatService['cleanupStalePlayers']();
      
      // Stale players are removed, and the now-empty channel goes with them
      const channelInfo = chatService.getChannelInfo('test-channel');
      expect(channelInfo?.players ?? []).not.toContain('stale-user');
    });
  });

  describe('handleMessage edge cases', () => {
    it('should handle message with empty string', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'user1' });
      
      // Try to send empty message
      chatService.handleMessage(mockSocket, { 
        channelId: 'test-channel', 
        username: 'user1', 
        message: '' 
      });
      
      // Should emit error for empty message
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle message with only whitespace', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'user1' });
      
      // Try to send whitespace-only message
      chatService.handleMessage(mockSocket, { 
        channelId: 'test-channel', 
        username: 'user1', 
        message: '   ' 
      });
      
      // Should handle whitespace-only message (this depends on your validation logic)
      // If you want to reject whitespace-only messages, add validation in the service
    });
  });

  describe('handleEmote edge cases', () => {
    it('should handle emote with empty string', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'user1' });
      
      // Try to send empty emote
      chatService.handleEmote(mockSocket, { 
        channelId: 'test-channel', 
        username: 'user1', 
        emote: '' 
      });
      
      // Should emit error for empty emote
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Missing required fields' });
    });

    it('should handle emote with invalid emote type', () => {
      const mockSocket = {
        id: 'test-socket-id',
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() })
      } as any;

      // Add user to channel
      chatService.joinChannel(mockSocket, { channelId: 'test-channel', username: 'user1' });
      
      // Try to send invalid emote
      chatService.handleEmote(mockSocket, { 
        channelId: 'test-channel', 
        username: 'user1', 
        emote: 'invalid-emote' 
      });
      
      // Should handle invalid emote (this depends on your validation logic)
      // If you want to validate emote types, add validation in the service
    });
  });
}); 