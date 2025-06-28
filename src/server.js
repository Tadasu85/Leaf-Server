const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('../config');

// Import modular services
const ChatService = require('./services/ChatService');
const UserService = require('./services/UserService');
const RoomService = require('./services/RoomService');
const Logger = require('./utils/Logger');

// Initialize logger
const logger = new Logger();

// Create Express app
const app = express();
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
          'https://leaf-game.herokuapp.com', 
          'https://leaf-game.netlify.app',
          'https://leaf-5lrq.onrender.com',
          process.env.REACT_APP_PRODUCTION_URL || 'https://leaf-5lrq.onrender.com'
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
const roomService = new RoomService(io, logger);

// Error handling
server.on('error', (error) => {
  logger.error('Server error:', error);
});

io.engine.on('connection_error', (err) => {
  logger.error('Connection error:', err);
});

// Socket connection handling
io.on('connection', (socket) => {
  logger.info(`New socket connection: ${socket.id}`);
  
  // Initialize user
  userService.handleConnection(socket);
  
  // Handle disconnection
  socket.on('disconnect', () => {
    userService.handleDisconnection(socket);
    chatService.handleDisconnection(socket);
    roomService.handleDisconnection(socket);
    logger.info(`Socket disconnected: ${socket.id}`);
  });
  
  // Chat events
  socket.on('joinChatChannel', (data) => {
    chatService.joinChannel(socket, data);
  });
  
  socket.on('leaveChatChannel', (data) => {
    chatService.leaveChannel(socket, data);
  });
  
  socket.on('chatMessage', (data) => {
    chatService.handleMessage(socket, data);
  });
  
  socket.on('emote', (data) => {
    chatService.handleEmote(socket, data);
  });
  
  // Room events
  socket.on('joinRoom', (data) => {
    roomService.joinRoom(socket, data);
  });
  
  socket.on('leaveRoom', (data) => {
    roomService.leaveRoom(socket, data);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      chat: chatService.getStatus(),
      users: userService.getStatus(),
      rooms: roomService.getStatus()
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server, io }; 