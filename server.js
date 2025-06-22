const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const cors = require('cors');

// Helper function for timestamped logging
const log = (...args) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
};

const app = express(); // Create an Express application (handles HTTP)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Enable both transports for better reliability
  pingTimeout: 30000, // Reduced timeout to 30 seconds
  pingInterval: 10000, // Reduced interval to 10 seconds
  connectTimeout: 20000, // Reduced timeout to 20 seconds
  allowUpgrades: true,
  maxHttpBufferSize: 1e6, // 1MB buffer size
  path: '/socket.io/' // Explicit path
});

// Add error handling for the server
server.on('error', (error) => {
  log('Server error:', error);
});

// Add error handling for the socket.io server
io.engine.on('connection_error', (err) => {
  log('Connection error:', err);
});

// Store room data - simplified structure
const rooms = new Map();

// Track connected users and their socket IDs
const connectedUsers = new Map();
const socketToUser = new Map();

// Add room building queue
const roomBuildQueue = new Map();

// Helper to get room ID
const getRoomId = (author, permlink) => `${author}/${permlink}`;

// Helper to log queue status
const logQueueStatus = () => {
  log('\n=== Room Build Queue Status ===');
  log(`Total items in queue: ${roomBuildQueue.size}`);
  roomBuildQueue.forEach((item, id) => {
    log(`\nQueue ID: ${id}`);
    log(`Builder: ${item.username}`);
    log(`From Room: ${item.room.author}/${item.room.permlink}`);
    log(`New Room: ${item.newRoom.author}/${item.newRoom.permlink}`);
    log(`Status: ${item.status}`);
    log(`Timestamp: ${new Date(item.timestamp).toLocaleString()}`);
    log('Exits:');
    log('- From New Room:', item.exits.fromNewRoom);
    log('- From Current Room:', item.exits.fromCurrentRoom);
    log('------------------------');
  });
  log('===========================\n');
};

// Helper to clean up empty rooms
const cleanupRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (room && room.players.length === 0) {
    log(`Cleaning up empty room: ${roomId}`);
    rooms.delete(roomId);
  }
};

// Helper to broadcast to room
const broadcastToRoom = (room, event, data) => {
  log(`Broadcasting ${event} to room ${room}:`, data);
  io.to(room).emit(event, data);
};

// Helper to handle user disconnection
const handleUserDisconnect = (username, socket) => {
  log(`Handling disconnect for user: ${username} (Socket ID: ${socket.id})`);
  
  // Get all rooms the user was in before removing tracking
  const userRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
  
  // Only remove from tracking if this is the last socket for this user
  const currentSocketId = connectedUsers.get(username);
  if (currentSocketId === socket.id) {
    log(`Removing user tracking for ${username}`);
    connectedUsers.delete(username);
  }
  socketToUser.delete(socket.id);
  
  // Remove from all rooms and update room states
  userRooms.forEach(room => {
    log(`Removing ${username} from room ${room} due to disconnect`);
    const roomInfo = rooms.get(room);
    if (roomInfo) {
      // Update room state directly
      roomInfo.players = roomInfo.players.filter(p => p !== username);
      rooms.set(room, roomInfo);
      
      // Clean up empty rooms
      cleanupRoom(room);
      
      // Broadcast room update to remaining players
      broadcastToRoom(room, 'playerLeft', {
        username,
        players: roomInfo.players,
        room
      });
    }
  });
};

// Helper to log room state
const logRoomState = (roomId, action) => {
  const room = rooms.get(roomId);
  log(`\n=== Room State (${action}) ===`);
  log(`Room ID: ${roomId}`);
  if (room) {
    log(`Players: ${room.players.join(', ')}`);
    log(`Last Updated: ${new Date(room.lastUpdated).toLocaleString()}`);
    if (room.body) log(`Body: ${room.body.substring(0, 100)}...`);
    if (room.title) log(`Title: ${room.title}`);
    if (room.exits) log(`Exits: ${Object.keys(room.exits).join(', ')}`);
    log('Full Room Data:', room);
  } else {
    log('Room not found');
  }
  log('===========================\n');
};

// Helper to log player state
const logPlayerState = (username, action) => {
  log(`\n=== Player State (${action}) ===`);
  log(`Username: ${username}`);
  log(`Socket ID: ${connectedUsers.get(username)}`);
  const playerRooms = Array.from(socketToUser.entries())
    .filter(([_, name]) => name === username)
    .map(([socketId]) => Array.from(io.sockets.sockets.get(socketId)?.rooms || []))
    .flat()
    .filter(room => room !== connectedUsers.get(username));
  log(`Current Rooms: ${playerRooms.join(', ')}`);
  log('===========================\n');
};

// Helper to sync room state
const syncRoomState = (room) => {
  const roomInfo = rooms.get(room);
  if (roomInfo) {
    // Get all sockets in the room
    const roomSockets = io.sockets.adapter.rooms.get(room);
    if (roomSockets) {
      // Get all usernames in the room
      const playersInRoom = Array.from(roomSockets)
        .map(socketId => socketToUser.get(socketId))
        .filter(Boolean);

      // Get room creator from room name
      const roomCreator = room.split('/')[0];
      
      // If room creator is not in the room but is still connected, add them back
      if (!playersInRoom.includes(roomCreator) && connectedUsers.has(roomCreator)) {
        log(`Adding room creator ${roomCreator} back to room ${room}`);
        playersInRoom.push(roomCreator);
      }

      log('Players in room:', playersInRoom);

      // Update room state with all required fields
      const updatedRoomInfo = {
        ...roomInfo,
        body: roomInfo.body || '',
        title: roomInfo.title || room,
        players: playersInRoom,
        details: roomInfo.details || {},
        exits: roomInfo.exits || {},
        author: roomInfo.author || roomCreator,
        permlink: roomInfo.permlink || room,
        lastUpdated: Date.now()
      };
      rooms.set(room, updatedRoomInfo);

      // Log room state change
      logRoomState(room, 'sync');

      // Broadcast updated state to all players with consistent format
      broadcastToRoom(room, 'roomUpdate', {
        ...updatedRoomInfo,
        room
      });

      return updatedRoomInfo;
    }
  }
  return roomInfo;
};

io.on('connection', (socket) => {
  const username = socket.handshake.query.username;
  log(`\n=== New Connection ===`);
  log(`Socket ID: ${socket.id}`);
  log(`Username: ${username}`);
  log(`Query params:`, socket.handshake.query);
  log('=== End New Connection ===\n');

  // Validate username is provided
  if (!username) {
    log('Connection attempt without username - disconnecting');
    socket.disconnect();
    return;
  }

  // Add debugging for all events
  socket.onAny((eventName, ...args) => {
    log(`\n=== Incoming Event: ${eventName} ===`);
    log(`Socket ID: ${socket.id}`);
    log(`Username: ${username}`);
    log(`Args:`, args);
    log(`=== End Event: ${eventName} ===\n`);
  });

  // Store user mapping
  connectedUsers.set(username, socket.id);
  socketToUser.set(socket.id, username);
  log(`User ${username} mapped to socket ${socket.id}`);

  // Check for existing connection and handle gracefully
  const existingSocketId = connectedUsers.get(username);
  if (existingSocketId && existingSocketId !== socket.id) {
    log(`User ${username} already connected with socket ${existingSocketId}`);
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      log(`Disconnecting existing socket ${existingSocketId} for user ${username}`);
      socketToUser.delete(existingSocketId);
      existingSocket.disconnect();
    }
  }
  
  log(`User connected: ${username} (Socket ID: ${socket.id})`);

  // Handle user registration
  socket.on('register', ({ username }, callback) => {
    log(`User registration request from: ${username} (Socket ID: ${socket.id})`);
    if (username && socket.id) {
      // Update user tracking
      connectedUsers.set(username, socket.id);
      socketToUser.set(socket.id, username);
      log(`User registered successfully: ${username}`);
      
      // Ensure callback is called with success
      if (typeof callback === 'function') {
        callback({ success: true });
      } else {
        log(`Registration callback not provided for user: ${username}`);
      }
    } else {
      log(`Registration failed for user: ${username}`);
      if (typeof callback === 'function') {
        callback({ success: false });
      }
    }
  });

  // Add getRoomState handler
  socket.on('getRoomState', ({ room }) => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      log('Error: Attempted to get room state without username');
      return;
    }
    
    log(`${username} requesting state for room: ${room}`);
    const roomInfo = rooms.get(room);
    if (roomInfo) {
      // Get current room state without broadcasting to all players
      const roomSockets = io.sockets.adapter.rooms.get(room);
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean);
      }
      
      // Get room creator from room name
      const roomCreator = room.split('/')[0];
      
      // If room creator is not in the room but is still connected, add them back
      if (!playersInRoom.includes(roomCreator) && connectedUsers.has(roomCreator)) {
        log(`Adding room creator ${roomCreator} back to room ${room}`);
        playersInRoom.push(roomCreator);
      }

      // Create room state without broadcasting
      const currentRoomInfo = {
        ...roomInfo,
        body: roomInfo.body || '',
        title: roomInfo.title || room,
        players: playersInRoom,
        details: roomInfo.details || {},
        exits: roomInfo.exits || {},
        author: roomInfo.author || roomCreator,
        permlink: roomInfo.permlink || room,
        lastUpdated: Date.now()
      };
      
      // Update room state without broadcasting
      rooms.set(room, currentRoomInfo);
      
      // Send room state only to the requesting socket
      socket.emit('roomState', {
        ...currentRoomInfo,
        room
      });
    } else {
      // If room doesn't exist, create it with current player and join the socket
      const newRoomInfo = {
        body: '',
        title: room,
        players: [username],
        details: {},
        exits: {},
        author: room.split('/')[0],
        permlink: room,
        lastUpdated: Date.now()
      };
      rooms.set(room, newRoomInfo);
      
      // Join the socket to the room
      socket.join(room);
      socket.currentRoom = room;
      log(`${username} joined room ${room} via getRoomState`);
      
      socket.emit('roomState', {
        ...newRoomInfo,
        room
      });
    }
  });

  // Handle room joining
  socket.on('joinRoom', (room) => {
    try {
      const username = socketToUser.get(socket.id);
      if (!username) {
        log('Error: Attempted to join room without username');
        return;
      }

      // Leave current room if any
      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
        log(`${username} left room ${socket.currentRoom}`);
      }

      // Join new room
      socket.join(room);
      socket.currentRoom = room;
      log(`${username} joined room ${room}`);

      // Update room state with all required fields
      const roomInfo = rooms.get(room) || {
        body: '',
        title: room,
        players: [],
        details: {},
        exits: {},
        author: room.split('/')[0],
        permlink: room,
        lastUpdated: Date.now()
      };

      // Add player to room if not already present
      if (!roomInfo.players.includes(username)) {
        roomInfo.players.push(username);
      }

      // Update room state
      rooms.set(room, roomInfo);

      // Log room state change
      logRoomState(room, 'join');

      // Calculate updated room state without broadcasting to all players
      const roomSockets = io.sockets.adapter.rooms.get(room);
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean);
      }
      
      // Get room creator from room name
      const roomCreator = room.split('/')[0];
      
      // If room creator is not in the room but is still connected, add them back
      if (!playersInRoom.includes(roomCreator) && connectedUsers.has(roomCreator)) {
        log(`Adding room creator ${roomCreator} back to room ${room}`);
        playersInRoom.push(roomCreator);
      }

      // Create updated room info
      const updatedRoomInfo = {
        ...roomInfo,
        body: roomInfo.body || '',
        title: roomInfo.title || room,
        players: playersInRoom,
        details: roomInfo.details || {},
        exits: roomInfo.exits || {},
        author: roomInfo.author || roomCreator,
        permlink: roomInfo.permlink || room,
        lastUpdated: Date.now()
      };
      
      // Update room state
      rooms.set(room, updatedRoomInfo);

      // Notify other players about the new player (but not the joining player)
      socket.to(room).emit('playerJoined', {
        username,
        players: updatedRoomInfo.players,
        room
      });

      // Send room state only to the joining player
      socket.emit('roomUpdate', {
        ...updatedRoomInfo,
        room
      });
    } catch (error) {
      log('Error in joinRoom:', error);
    }
  });

  // Handle room leaves
  socket.on('leaveRoom', ({ username, room }) => {
    log(`\n=== Room Leave Event ===`);
    log(`Player: ${username}`);
    log(`Room: ${room}`);
    log(`Socket ID: ${socket.id}`);
    
    if (!room || !username) {
      log('Invalid leave request - missing room or username');
      return;
    }
    
    socket.leave(room);
    
    // Clear the current room if it matches the room being left
    if (socket.currentRoom === room) {
      socket.currentRoom = null;
      log(`${username} cleared current room tracking`);
    }
    
    // Update room state and notify remaining players
    const updatedRoomState = syncRoomState(room);
    if (updatedRoomState) {
      broadcastToRoom(room, 'playerLeft', {
        username,
        players: updatedRoomState.players,
        room
      });
    }
    
    // Log player state after leave
    logPlayerState(username, 'leave');
    log('=== End Room Leave Event ===\n');
  });

  // Handle chat messages
  socket.on('chat', ({ room, message, username }) => {
    if (!room || !username || !message) {
      log('Invalid chat message - missing room, username, or message');
      return;
    }
    log(`\n=== Chat Event ===`);
    log(`Room: ${room}`);
    log(`Player: ${username}`);
    log(`Message: ${message}`);
    log('=== End Chat Event ===\n');
    broadcastToRoom(room, 'chat', { username, message, room });
  });

  // Handle emotes
  socket.on('emote', ({ room, emote, username }) => {
    if (!room || !username || !emote) {
      log('Invalid emote - missing room, username, or emote');
      return;
    }
    log(`\n=== Emote Event ===`);
    log(`Room: ${room}`);
    log(`Player: ${username}`);
    log(`Emote: ${emote}`);
    log('=== End Emote Event ===\n');
    broadcastToRoom(room, 'emote', { username, emote, room });
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ from, to, signal }) => {
    log(`Signal from ${from} to ${to} (type: ${signal.type})`);
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      log(`Forwarding signal to ${to} (Socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('signal', { from, signal });
    } else {
      log(`Target user ${to} not found for signal. Current users:`, Array.from(connectedUsers.entries()));
    }
  });

  // Handle room build requests
  socket.on('queueRoomBuild', ({ room, newRoom, exits }, callback) => {
    log('\n=== New Room Build Request ===');
    log(`Builder: ${username}`);
    log(`From Room: ${room.author}/${room.permlink}`);
    log(`New Room: ${newRoom.author}/${newRoom.permlink}`);
    log('Exits:');
    log('- From New Room:', exits.fromNewRoom);
    log('- From Current Room:', exits.fromCurrentRoom);
    
    // Add to queue
    const queueId = Date.now().toString();
    roomBuildQueue.set(queueId, {
      username,
      room,
      newRoom,
      exits,
      timestamp: Date.now(),
      status: 'pending'
    });

    // Log updated queue status
    logQueueStatus();

    // Send back the queue ID to the client
    if (callback) {
      callback({ queueId });
    }
  });

  // Handle room build approvals
  socket.on('approveRoomBuild', ({ queueId }) => {
    log('\n=== Room Build Approval ===');
    log(`Queue ID: ${queueId}`);
    
    const buildRequest = roomBuildQueue.get(queueId);
    if (buildRequest) {
      log(`Approving build request from ${buildRequest.username}`);
      log(`New Room: ${buildRequest.newRoom.author}/${buildRequest.newRoom.permlink}`);
      
      buildRequest.status = 'approved';
      roomBuildQueue.set(queueId, buildRequest);
      
      // Log updated queue status
      logQueueStatus();
      
      // Notify the builder with consistent format
      const builderSocketId = connectedUsers.get(buildRequest.username);
      if (builderSocketId) {
        io.to(builderSocketId).emit('roomBuildApproved', { 
          queueId,
          room: buildRequest.room,
          newRoom: buildRequest.newRoom
        });
      }
    } else {
      log(`Build request ${queueId} not found in queue`);
    }
  });

  // Handle room build rejections
  socket.on('rejectRoomBuild', ({ queueId, reason }) => {
    log('\n=== Room Build Rejection ===');
    log(`Queue ID: ${queueId}`);
    log(`Reason: ${reason}`);
    
    const buildRequest = roomBuildQueue.get(queueId);
    if (buildRequest) {
      log(`Rejecting build request from ${buildRequest.username}`);
      log(`New Room: ${buildRequest.newRoom.author}/${buildRequest.newRoom.permlink}`);
      
      buildRequest.status = 'rejected';
      buildRequest.rejectionReason = reason;
      roomBuildQueue.set(queueId, buildRequest);
      
      // Log updated queue status
      logQueueStatus();
      
      // Notify the builder with consistent format
      const builderSocketId = connectedUsers.get(buildRequest.username);
      if (builderSocketId) {
        io.to(builderSocketId).emit('roomBuildRejected', { 
          queueId,
          reason,
          room: buildRequest.room,
          newRoom: buildRequest.newRoom
        });
      }
    } else {
      log(`Build request ${queueId} not found in queue`);
    }
  });

  // Handle queue status requests
  socket.on('getBuildQueue', () => {
    log('\n=== Queue Status Request ===');
    log(`Requested by: ${username}`);
    logQueueStatus();
    
    // Send queue status with consistent format
    const queueStatus = Array.from(roomBuildQueue.entries()).map(([id, request]) => ({
      id,
      username: request.username,
      room: request.room,
      newRoom: request.newRoom,
      status: request.status,
      timestamp: request.timestamp,
      exits: request.exits,
      rejectionReason: request.rejectionReason
    }));
    
    socket.emit('buildQueueStatus', queueStatus);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      log(`\n=== Disconnect Event ===`);
      log(`Player: ${username}`);
      log(`Socket ID: ${socket.id}`);
      
      // Remove user from tracking and handle room cleanup
      handleUserDisconnect(username, socket);
      
      log('=== End Disconnect Event ===\n');
    }
  });
});

// Add a basic HTTP GET route for the root path
app.get('/', (req, res) => {
  res.sendStatus(200); // Respond with a 200 OK status for health checks
});

const PORT = process.env.PORT || 4001;

// Only start the server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    log(`Signaling server running on port ${PORT}`);
  });
}

module.exports = { server, io };