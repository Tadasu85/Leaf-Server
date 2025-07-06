import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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

// Rate limiting configuration
const createRateLimiter = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ error: message });
    }
  });
};

// General API rate limiting (15 minutes, 100 requests)
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP'
);

// Stricter rate limiting for socket connections (1 minute, 10 connections)
const socketLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  10, // 10 socket connections per minute per IP
  'Too many socket connections from this IP'
);

// Create Express app
const app = express();

// Apply rate limiting to all routes
app.use(apiLimiter);

// Apply stricter rate limiting to socket.io endpoint
app.use('/socket.io/', socketLimiter);

app.use(cors({
  origin: process.env['NODE_ENV'] === 'production' 
    ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create HTTP server
const server = createServer(app);

// Socket.IO rate limiting storage
const socketRateLimits = new Map<string, {
  messageCount: number;
  lastReset: number;
  connections: number;
  joinLeaveCount: number;
  lastJoinLeaveReset: number;
}>();

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

// Cleanup function for tests
const cleanup = () => {
  chatService.cleanup();
  // Add any other cleanup needed for UserService if it has intervals
};

// Export cleanup for tests
export { cleanup };

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
  const userIP = socket.handshake.address;
  
  logger.info(`New socket connection: ${socket.id}, username: ${username}, IP: ${userIP}`);
  
  // Validate username is provided
  if (!username) {
    logger.warn('Connection attempt without username - disconnecting');
    socket.disconnect();
    return;
  }

  // Initialize rate limiting for this user
  if (!socketRateLimits.has(userIP)) {
    socketRateLimits.set(userIP, {
      messageCount: 0,
      lastReset: Date.now(),
      connections: 0,
      joinLeaveCount: 0,
      lastJoinLeaveReset: Date.now()
    });
  }
  
  const userLimit = socketRateLimits.get(userIP)!;
  userLimit.connections++;

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

  // Chat events with rate limiting
  socket.on('joinChatChannel', (data: JoinChatChannelData) => {
    // Rate limit join/leave operations
    const now = Date.now();
    if (now - userLimit.lastJoinLeaveReset > 60000) { // 1 minute
      userLimit.joinLeaveCount = 0;
      userLimit.lastJoinLeaveReset = now;
    }
    
    if (userLimit.joinLeaveCount > 20) { // max 20 join/leave operations per minute
      logger.warn(`Rate limit exceeded for join/leave operations: ${socket.handshake.query['username']} (${userIP})`);
      socket.emit('error', { message: 'Too many room changes. Please wait a moment.' });
      return;
    }
    
    userLimit.joinLeaveCount++;
    
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
    // Rate limit join/leave operations
    const now = Date.now();
    if (now - userLimit.lastJoinLeaveReset > 60000) { // 1 minute
      userLimit.joinLeaveCount = 0;
      userLimit.lastJoinLeaveReset = now;
    }
    
    if (userLimit.joinLeaveCount > 20) { // max 20 join/leave operations per minute
      logger.warn(`Rate limit exceeded for join/leave operations: ${socket.handshake.query['username']} (${userIP})`);
      socket.emit('error', { message: 'Too many room changes. Please wait a moment.' });
      return;
    }
    
    userLimit.joinLeaveCount++;
    
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to leave chat channel without username');
      return;
    }
    chatService.leaveChannel(socket, { ...data, username });
  });
  
  socket.on('chatMessage', (data: ChatMessageData) => {
    // Rate limit chat messages
    const now = Date.now();
    if (now - userLimit.lastReset > 60000) { // 1 minute
      userLimit.messageCount = 0;
      userLimit.lastReset = now;
    }
    
    if (userLimit.messageCount > 30) { // max 30 messages per minute
      logger.warn(`Rate limit exceeded for chat messages: ${socket.handshake.query['username']} (${userIP})`);
      socket.emit('error', { message: 'Too many messages. Please wait a moment.' });
      return;
    }
    
    userLimit.messageCount++;
    
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to send chat message without username');
      return;
    }
    chatService.handleMessage(socket, { ...data, username });
  });
  
  socket.on('emote', (data: EmoteData) => {
    // Rate limit emotes
    const now = Date.now();
    if (now - userLimit.lastReset > 60000) { // 1 minute
      userLimit.messageCount = 0;
      userLimit.lastReset = now;
    }
    
    if (userLimit.messageCount > 30) { // max 30 emotes per minute
      logger.warn(`Rate limit exceeded for emotes: ${socket.handshake.query['username']} (${userIP})`);
      socket.emit('error', { message: 'Too many emotes. Please wait a moment.' });
      return;
    }
    
    userLimit.messageCount++;
    
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
    // Clean up rate limiting data
    if (userLimit) {
      userLimit.connections--;
      if (userLimit.connections <= 0) {
        socketRateLimits.delete(userIP);
      }
    }
    
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
    logger.info('Rate limiting enabled:');
    logger.info('- API: 100 requests per 15 minutes');
    logger.info('- Socket connections: 10 per minute');
    logger.info('- Chat messages: 30 per minute');
    logger.info('- Room changes: 20 per minute');
  });
}

export { app, server, io }; 