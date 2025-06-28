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
  const username = socket.handshake.query.username;
  logger.info(`New socket connection: ${socket.id}, username: ${username}`);
  
  // Validate username is provided
  if (!username) {
    logger.warn('Connection attempt without username - disconnecting');
    socket.disconnect();
    return;
  }

  // Initialize user
  userService.handleConnection(socket);
  
  // Handle user registration
  socket.on('register', ({ username }, callback) => {
    logger.info(`User registration request from: ${username} (Socket ID: ${socket.id})`);
    const success = userService.registerUser(socket, username);
    
    if (typeof callback === 'function') {
      callback({ success });
    }
  });

  // Handle room state request
  socket.on('getRoomState', ({ room }) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to get room state without username');
      return;
    }
    
    logger.info(`${username} requesting state for room: ${room}`);
    const roomInfo = roomService.getRoomInfo(room);
    
    socket.emit('roomState', {
      room,
      players: roomInfo ? roomInfo.players : [],
      lastUpdated: roomInfo ? roomInfo.lastUpdated : Date.now()
    });
  });

  // Handle room joining
  socket.on('joinRoom', (room) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to join room without username');
      return;
    }
    
    logger.info(`User ${username} joining room: ${room}`);
    roomService.joinRoom(socket, { roomId: room, username });
  });

  // Handle room leaving
  socket.on('leaveRoom', ({ username, room }) => {
    const currentUsername = userService.getUserBySocket(socket.id);
    if (!currentUsername || currentUsername !== username) {
      logger.warn('Username mismatch in leaveRoom');
      return;
    }
    
    logger.info(`User ${username} leaving room: ${room}`);
    roomService.leaveRoom(socket, { roomId: room, username });
  });

  // Handle room data updates
  socket.on('updateRoomData', ({ room, roomData }) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to update room data without username');
      return;
    }
    
    logger.info(`User ${username} updating room data for: ${room}`);
    roomService.updateRoomData(room, roomData);
  });

  // Chat events
  socket.on('joinChatChannel', (data) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to join chat channel without username');
      return;
    }
    chatService.joinChannel(socket, { ...data, username });
  });
  
  socket.on('leaveChatChannel', (data) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to leave chat channel without username');
      return;
    }
    chatService.leaveChannel(socket, { ...data, username });
  });
  
  socket.on('chatMessage', (data) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to send chat message without username');
      return;
    }
    chatService.handleMessage(socket, { ...data, username });
  });
  
  socket.on('emote', (data) => {
    const username = userService.getUserBySocket(socket.id);
    if (!username) {
      logger.warn('Attempted to send emote without username');
      return;
    }
    chatService.handleEmote(socket, { ...data, username });
  });

  // Legacy chat events (for backward compatibility)
  socket.on('chat', ({ room, message, username }) => {
    const currentUsername = userService.getUserBySocket(socket.id);
    if (!currentUsername || currentUsername !== username) {
      logger.warn('Username mismatch in chat');
      return;
    }
    io.to(room).emit('chat', { username, message, room });
  });

  socket.on('emote', ({ room, emote, username }) => {
    const currentUsername = userService.getUserBySocket(socket.id);
    if (!currentUsername || currentUsername !== username) {
      logger.warn('Username mismatch in emote');
      return;
    }
    io.to(room).emit('emote', { username, emote, room });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    userService.handleDisconnection(socket);
    chatService.handleDisconnection(socket);
    roomService.handleDisconnection(socket);
    logger.info(`Socket disconnected: ${socket.id}`);
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

// Basic HTTP GET route for the root path
app.get('/', (req, res) => {
  res.sendStatus(200); // Respond with a 200 OK status for health checks
});

// Start server
const PORT = process.env.PORT || 4001;

// Only start the server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = { app, server, io }; 