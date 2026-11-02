// Import all types to ensure they are properly exported and accessible
import * as Types from '../src/types';

// Also import individual types for specific testing
import {
  HiveConfig,
  GameConfig,
  ServerConfig,
  ChatChannel,
  ChatMessage,
  EmoteMessage,
  PlayerJoinedEvent,
  PlayerLeftEvent,
  ChatChannelState,
  UserSession,
  UserStatusEvent,
  ChatServiceStatus,
  UserServiceStatus,
  HealthCheckResponse,
  JoinChatChannelData,
  LeaveChatChannelData,
  ChatMessageData,
  EmoteData,
  RegisterData,
  RegisterResponse,
  Logger,
  ChatServiceInterface,
  UserServiceInterface,
  validateHiveConfig,
  validateGameConfig,
  validateServerConfig,
  createDefaultChatChannel,
  createDefaultUserSession
} from '../src/types';

describe('Type Definitions', () => {
  describe('Type Exports', () => {
    it('should allow type instantiation', () => {
      // Test that types can be used to create objects
      const hiveConfig: Types.HiveConfig = { nodes: ['test'] };
      const gameConfig: Types.GameConfig = { idName: 'test', account: 'test' };
      const chatChannel: Types.ChatChannel = { players: [], lastUpdated: Date.now() };
      
      expect(hiveConfig).toBeDefined();
      expect(gameConfig).toBeDefined();
      expect(chatChannel).toBeDefined();
    });

    it('should compile without errors', () => {
      // This test ensures that all types are properly defined and can be used
      // If there are any type errors, the test will fail to compile
      const testObject: Types.ServerConfig = {
        hive: { nodes: ['test'] },
        game: { idName: 'test', account: 'test' },
        signalingServer: 'test',
        admins: ['admin'],
        builders: ['builder']
      };
      
      expect(testObject).toBeDefined();
    });
  });

  describe('Utility Functions', () => {
    it('should validate HiveConfig correctly', () => {
      const validConfig: HiveConfig = { nodes: ['https://api.hive.blog'] };
      const invalidConfig: HiveConfig = { nodes: [] };
      
      expect(validateHiveConfig(validConfig)).toBe(true);
      expect(validateHiveConfig(invalidConfig)).toBe(false);
    });

    it('should validate GameConfig correctly', () => {
      const validConfig: GameConfig = { idName: 'test-game', account: 'test-account' };
      const invalidConfig = { idName: 'test-game' }; // missing account
      
      expect(validateGameConfig(validConfig)).toBe(true);
      expect(validateGameConfig(invalidConfig as GameConfig)).toBe(false);
    });

    it('should validate ServerConfig correctly', () => {
      const validConfig: ServerConfig = {
        hive: { nodes: ['https://api.hive.blog'] },
        game: { idName: 'test-game', account: 'test-account' },
        signalingServer: 'wss://signaling.example.com',
        admins: ['admin'],
        builders: ['builder']
      };
      
      expect(validateServerConfig(validConfig)).toBe(true);
    });

    it('should create default chat channel', () => {
      const channel = createDefaultChatChannel('test-channel');
      
      expect(channel.players).toEqual([]);
      expect(typeof channel.lastUpdated).toBe('number');
      expect(channel.lastUpdated).toBeGreaterThan(0);
    });

    it('should create default user session', () => {
      const session = createDefaultUserSession('testuser', 'socket-123');
      
      expect(session.username).toBe('testuser');
      expect(session.socketId).toBe('socket-123');
      expect(session.isOnline).toBe(true);
      expect(typeof session.connectedAt).toBe('number');
      expect(typeof session.lastSeen).toBe('number');
    });
  });

  describe('Configuration Types', () => {
    it('should define HiveConfig correctly', () => {
      const hiveConfig: HiveConfig = {
        nodes: ['https://api.hive.blog', 'https://api.hivekings.com']
      };

      expect(hiveConfig.nodes).toBeInstanceOf(Array);
      expect(hiveConfig.nodes.length).toBe(2);
      expect(typeof hiveConfig.nodes[0]).toBe('string');
    });

    it('should define GameConfig correctly', () => {
      const gameConfig: GameConfig = {
        idName: 'leaf-game',
        account: 'leaf-game-account'
      };

      expect(typeof gameConfig.idName).toBe('string');
      expect(typeof gameConfig.account).toBe('string');
    });

    it('should define ServerConfig correctly', () => {
      const serverConfig: ServerConfig = {
        hive: {
          nodes: ['https://api.hive.blog']
        },
        game: {
          idName: 'leaf-game',
          account: 'leaf-game-account'
        },
        signalingServer: 'wss://signaling.example.com',
        admins: ['admin1', 'admin2'],
        builders: ['builder1', 'builder2']
      };

      expect(serverConfig.hive).toBeDefined();
      expect(serverConfig.game).toBeDefined();
      expect(typeof serverConfig.signalingServer).toBe('string');
      expect(serverConfig.admins).toBeInstanceOf(Array);
      expect(serverConfig.builders).toBeInstanceOf(Array);
    });
  });

  describe('Chat Types', () => {
    it('should define ChatChannel correctly', () => {
      const chatChannel: ChatChannel = {
        players: ['user1', 'user2'],
        lastUpdated: Date.now()
      };

      expect(chatChannel.players).toBeInstanceOf(Array);
      expect(typeof chatChannel.lastUpdated).toBe('number');
    });

    it('should define ChatMessage correctly', () => {
      const chatMessage: ChatMessage = {
        username: 'testuser',
        message: 'Hello world',
        timestamp: Date.now(),
        channelId: 'test-channel'
      };

      expect(typeof chatMessage.username).toBe('string');
      expect(typeof chatMessage.message).toBe('string');
      expect(typeof chatMessage.timestamp).toBe('number');
      expect(typeof chatMessage.channelId).toBe('string');
    });

    it('should define EmoteMessage correctly', () => {
      const emoteMessage: EmoteMessage = {
        username: 'testuser',
        emote: 'wave',
        timestamp: Date.now(),
        channelId: 'test-channel'
      };

      expect(typeof emoteMessage.username).toBe('string');
      expect(typeof emoteMessage.emote).toBe('string');
      expect(typeof emoteMessage.timestamp).toBe('number');
      expect(typeof emoteMessage.channelId).toBe('string');
    });

    it('should define PlayerJoinedEvent correctly', () => {
      const playerJoinedEvent: PlayerJoinedEvent = {
        username: 'newuser',
        players: ['user1', 'user2', 'newuser'],
        channelId: 'test-channel'
      };

      expect(typeof playerJoinedEvent.username).toBe('string');
      expect(playerJoinedEvent.players).toBeInstanceOf(Array);
      expect(typeof playerJoinedEvent.channelId).toBe('string');
    });

    it('should define PlayerLeftEvent correctly', () => {
      const playerLeftEvent: PlayerLeftEvent = {
        username: 'leavinguser',
        players: ['user1', 'user2'],
        channelId: 'test-channel'
      };

      expect(typeof playerLeftEvent.username).toBe('string');
      expect(playerLeftEvent.players).toBeInstanceOf(Array);
      expect(typeof playerLeftEvent.channelId).toBe('string');
    });

    it('should define ChatChannelState correctly', () => {
      const chatChannelState: ChatChannelState = {
        channelId: 'test-channel',
        players: ['user1', 'user2'],
        lastUpdated: Date.now()
      };

      expect(typeof chatChannelState.channelId).toBe('string');
      expect(chatChannelState.players).toBeInstanceOf(Array);
      expect(typeof chatChannelState.lastUpdated).toBe('number');
    });
  });

  describe('User Types', () => {
    it('should define UserSession correctly', () => {
      const userSession: UserSession = {
        username: 'testuser',
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        isOnline: true,
        socketId: 'socket-123'
      };

      expect(typeof userSession.username).toBe('string');
      expect(typeof userSession.connectedAt).toBe('number');
      expect(typeof userSession.lastSeen).toBe('number');
      expect(typeof userSession.isOnline).toBe('boolean');
      expect(typeof userSession.socketId).toBe('string');
    });

    it('should define UserStatusEvent correctly', () => {
      const userStatusEvent: UserStatusEvent = {
        username: 'testuser',
        isOnline: true,
        timestamp: Date.now()
      };

      expect(typeof userStatusEvent.username).toBe('string');
      expect(typeof userStatusEvent.isOnline).toBe('boolean');
      expect(typeof userStatusEvent.timestamp).toBe('number');
    });
  });

  describe('Service Status Types', () => {
    it('should define ChatServiceStatus correctly', () => {
      const chatServiceStatus: ChatServiceStatus = {
        activeChannels: 5,
        connectedUsers: 10,
        channels: ['channel1', 'channel2', 'channel3']
      };

      expect(typeof chatServiceStatus.activeChannels).toBe('number');
      expect(typeof chatServiceStatus.connectedUsers).toBe('number');
      expect(chatServiceStatus.channels).toBeInstanceOf(Array);
    });

    it('should define UserServiceStatus correctly', () => {
      const userServiceStatus: UserServiceStatus = {
        connectedUsers: 15,
        totalSessions: 20,
        onlineUsers: ['user1', 'user2', 'user3'],
        adminAccounts: ['admin1', 'admin2']
      };

      expect(typeof userServiceStatus.connectedUsers).toBe('number');
      expect(typeof userServiceStatus.totalSessions).toBe('number');
      expect(userServiceStatus.onlineUsers).toBeInstanceOf(Array);
      expect(userServiceStatus.adminAccounts).toBeInstanceOf(Array);
    });

    it('should define HealthCheckResponse correctly', () => {
      const healthCheckResponse: HealthCheckResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          chat: {
            activeChannels: 3,
            connectedUsers: 8
          },
          users: {
            connectedUsers: 8,
            totalSessions: 12
          }
        }
      };

      expect(healthCheckResponse.status).toBe('ok');
      expect(typeof healthCheckResponse.timestamp).toBe('string');
      expect(healthCheckResponse.services).toBeDefined();
      expect(healthCheckResponse.services.chat).toBeDefined();
      expect(healthCheckResponse.services.users).toBeDefined();
    });
  });

  describe('Socket Event Data Types', () => {
    it('should define JoinChatChannelData correctly', () => {
      const joinData: JoinChatChannelData = {
        channelId: 'test-channel'
      };

      expect(typeof joinData.channelId).toBe('string');
    });

    it('should define LeaveChatChannelData correctly', () => {
      const leaveData: LeaveChatChannelData = {
        channelId: 'test-channel',
        username: 'testuser'
      };

      expect(typeof leaveData.channelId).toBe('string');
      expect(typeof leaveData.username).toBe('string');
    });

    it('should define ChatMessageData correctly', () => {
      const messageData: ChatMessageData = {
        channelId: 'test-channel',
        message: 'Hello world'
      };

      expect(typeof messageData.channelId).toBe('string');
      expect(typeof messageData.message).toBe('string');
    });

    it('should define EmoteData correctly', () => {
      const emoteData: EmoteData = {
        channelId: 'test-channel',
        emote: 'wave'
      };

      expect(typeof emoteData.channelId).toBe('string');
      expect(typeof emoteData.emote).toBe('string');
    });

    it('should define RegisterData correctly', () => {
      const registerData: RegisterData = {
        username: 'newuser'
      };

      expect(typeof registerData.username).toBe('string');
    });

    it('should define RegisterResponse correctly', () => {
      const registerResponse: RegisterResponse = {
        success: true,
        message: 'User registered successfully'
      };

      expect(typeof registerResponse.success).toBe('boolean');
      expect(typeof registerResponse.message).toBe('string');
    });
  });

  describe('Interface Types', () => {
    it('should define Logger interface correctly', () => {
      const logger: Logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      };

      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should define ChatServiceInterface correctly', () => {
      const chatService: ChatServiceInterface = {
        handleConnection: jest.fn(),
        handleDisconnection: jest.fn(),
        joinChannel: jest.fn(),
        leaveChannel: jest.fn(),
        handleMessage: jest.fn(),
        handleEmote: jest.fn(),
        handleKeepaliveResponse: jest.fn(),
        getChannelInfo: jest.fn(),
        getAllChannels: jest.fn(),
        getStatus: jest.fn()
      };

      expect(typeof chatService.handleConnection).toBe('function');
      expect(typeof chatService.handleDisconnection).toBe('function');
      expect(typeof chatService.joinChannel).toBe('function');
      expect(typeof chatService.leaveChannel).toBe('function');
      expect(typeof chatService.handleMessage).toBe('function');
      expect(typeof chatService.handleEmote).toBe('function');
      expect(typeof chatService.getChannelInfo).toBe('function');
      expect(typeof chatService.getAllChannels).toBe('function');
      expect(typeof chatService.getStatus).toBe('function');
    });

    it('should define UserServiceInterface correctly', () => {
      const userService: UserServiceInterface = {
        handleConnection: jest.fn(),
        handleDisconnection: jest.fn(),
        registerUser: jest.fn(),
        unregisterUser: jest.fn(),
        getUserBySocket: jest.fn(),
        getSocketByUser: jest.fn(),
        isUserOnline: jest.fn(),
        getOnlineUsers: jest.fn(),
        getUserSession: jest.fn(),
        getAllSessions: jest.fn(),
        filterAdminAccounts: jest.fn(),
        broadcastUserStatus: jest.fn(),
        getConnectedUsersCount: jest.fn(),
        getStatus: jest.fn(),
        cleanupOldSessions: jest.fn()
      };

      expect(typeof userService.handleConnection).toBe('function');
      expect(typeof userService.handleDisconnection).toBe('function');
      expect(typeof userService.registerUser).toBe('function');
      expect(typeof userService.unregisterUser).toBe('function');
      expect(typeof userService.getUserBySocket).toBe('function');
      expect(typeof userService.getSocketByUser).toBe('function');
      expect(typeof userService.isUserOnline).toBe('function');
      expect(typeof userService.getOnlineUsers).toBe('function');
      expect(typeof userService.getUserSession).toBe('function');
      expect(typeof userService.getAllSessions).toBe('function');
      expect(typeof userService.filterAdminAccounts).toBe('function');
      expect(typeof userService.broadcastUserStatus).toBe('function');
      expect(typeof userService.getConnectedUsersCount).toBe('function');
      expect(typeof userService.getStatus).toBe('function');
      expect(typeof userService.cleanupOldSessions).toBe('function');
    });
  });
}); 