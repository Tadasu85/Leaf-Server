import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
// import config from './config'; // Not currently used
import ChatService from './services/ChatService';
import UserService from './services/UserService';
import Logger from './utils/Logger';
import { 
  RegisterData, 
  RegisterResponse, 
  JoinChatChannelData, 
  LeaveChatChannelData, 
  ChatMessageData, 
  EmoteData,
  HealthCheckResponse 
} from './types';

// Initialize logger
const logger = new Logger();

// Create Express app
const app = express();
app.use(cors({
  origin: process.env['NODE_ENV'] === 'production' 
    ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create HTTP server
const server = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env['NODE_ENV'] === 'production'
      ? [
          'https://leaf-game.herokuapp.com', 
          'https://leaf-game.netlify.app',
          'https://leaf-5lrq.onrender.com',
          process.env['REACT_APP_PRODUCTION_URL'] || 'https://leaf-5lrq.onrender.com'
        ]
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 10000,
  connectTimeout: 20000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e6,
  path: '/socket.io/'
});

// Initialize services
const chatService = new ChatService(io, logger);
const userService = new UserService(io, logger);

// Error handling
server.on('error', (error: Error) => {
  logger.error('Server error:', error);
});

io.engine.on('connection_error', (err: Error) => {
  logger.error('Connection error:', err);
});

// Socket connection handling
io.on('connection', (socket) => {
  const username = socket.handshake.query['username'] as string;
  logger.info(`New socket connection: ${socket.id}, username: ${username}`);
  
  // Validate username is provided
  if (!username) {
    logger.warn('Connection attempt without username - disconnecting');
    socket.disconnect();
    return;
  }

  // Initialize user and register with username from query
  userService.handleConnection(socket);
  userService.registerUser(socket, username);
  
  // Handle user registration
  socket.on('register', (data: RegisterData) => {
    const { username: registerUsername } = data;
    if (registerUsername && registerUsername !== username) {
      // If username in register event differs from query username, update it
      userService.registerUser(socket, registerUsername);
      const response: RegisterResponse = { success: true };
      socket.emit('registered', response);
    } else {
      const response: RegisterResponse = { success: true };
      socket.emit('registered', response);
    }
  });

  // Chat events
  socket.on('joinChatChannel', (data: JoinChatChannelData) => {
    logger.info(`[Server] Received joinChatChannel event from socket ${socket.id}: ${JSON.stringify(data)}`);
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to join chat channel without username');
      return;
    }
    logger.info(`[Server] Calling chatService.joinChannel for user ${username}`);
    chatService.joinChannel(socket, { ...data, username });
  });
  
  socket.on('leaveChatChannel', (data: LeaveChatChannelData) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to leave chat channel without username');
      return;
    }
    chatService.leaveChannel(socket, { ...data, username });
  });
  
  socket.on('chatMessage', (data: ChatMessageData) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to send chat message without username');
      return;
    }
    chatService.handleMessage(socket, { ...data, username });
  });
  
  socket.on('emote', (data: EmoteData) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to send emote without username');
      return;
    }
    
    if (!data.channelId || !data.emote) {
      socket.emit('error', { message: 'Missing channelId or emote' });
      return;
    }
    
    chatService.handleEmote(socket, { channelId: data.channelId, emote: data.emote, username });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    userService.handleDisconnection(socket);
    chatService.handleDisconnection(socket);
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      chat: chatService.getStatus(),
      users: userService.getStatus()
    }
  };
  res.json(response);
});

// Basic HTTP GET route for the root path
app.get('/', (_req: Request, res: Response) => {
  res.sendStatus(200); // Respond with a 200 OK status for health checks
});

// Start server
const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 4001;

// Only start the server if not in test environment
if (process.env['NODE_ENV'] !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
  });
}

export { app, server, io }; 