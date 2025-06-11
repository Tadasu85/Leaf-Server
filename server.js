const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const cors = require('cors');

const app = express(); // Create an Express application (handles HTTP)
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket'], // Only use WebSocket
  pingTimeout: 30000, // Reduced timeout
  pingInterval: 15000, // Reduced interval
  connectTimeout: 20000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e6 // Reduced buffer size
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
  console.log('\n=== Room Build Queue Status ===');
  console.log(`Total items in queue: ${roomBuildQueue.size}`);
  roomBuildQueue.forEach((item, id) => {
    console.log(`\nQueue ID: ${id}`);
    console.log(`Builder: ${item.username}`);
    console.log(`From Room: ${item.room.author}/${item.room.permlink}`);
    console.log(`New Room: ${item.newRoom.author}/${item.newRoom.permlink}`);
    console.log(`Status: ${item.status}`);
    console.log(`Timestamp: ${new Date(item.timestamp).toLocaleString()}`);
    console.log('Exits:');
    console.log('- From New Room:', item.exits.fromNewRoom);
    console.log('- From Current Room:', item.exits.fromCurrentRoom);
    console.log('------------------------');
  });
  console.log('===========================\n');
};

// Helper to clean up empty rooms
const cleanupRoom = (roomId) => {
  const room = rooms.get(roomId);
  if (room && room.players.length === 0) {
    console.log(`Cleaning up empty room: ${roomId}`);
    rooms.delete(roomId);
  }
};

// Helper to broadcast to room
const broadcastToRoom = (room, event, data) => {
  console.log(`Broadcasting ${event} to room ${room}:`, data);
  io.to(room).emit(event, data);
};

// Helper to handle user disconnection
const handleUserDisconnect = (username, socket) => {
  console.log(`Handling disconnect for user: ${username} (Socket ID: ${socket.id})`);
  
  // Only remove from tracking if this is the last socket for this user
  const currentSocketId = connectedUsers.get(username);
  if (currentSocketId === socket.id) {
    console.log(`Removing user tracking for ${username}`);
    connectedUsers.delete(username);
  }
  socketToUser.delete(socket.id);
  
  // Remove from all rooms
  socket.rooms.forEach(room => {
    if (room !== socket.id) {
      console.log(`Removing ${username} from room ${room} due to disconnect`);
      const roomInfo = rooms.get(room);
      if (roomInfo) {
        roomInfo.players = roomInfo.players.filter(p => p !== username);
        cleanupRoom(room);
        
        // Broadcast room update to remaining players
        broadcastToRoom(room, 'roomUpdate', {
          room,
          players: roomInfo.players
        });
      }
    }
  });
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

      // Update room state
      roomInfo.players = playersInRoom;
      roomInfo.lastUpdated = Date.now();
      rooms.set(room, roomInfo);

      // Broadcast updated state to all players with consistent format
      broadcastToRoom(room, 'roomUpdate', {
        room,
        players: playersInRoom
      });
    }
  }
};

io.on('connection', (socket) => {
  const username = socket.handshake.query.username;
  console.log(`New connection attempt from: ${username} (Socket ID: ${socket.id})`);
  
  if (!username) {
    console.error('Connection attempt without username');
    socket.disconnect();
    return;
  }

  // Check for existing connection
  const existingSocketId = connectedUsers.get(username);
  if (existingSocketId) {
    console.log(`User ${username} already connected with socket ${existingSocketId}`);
    const existingSocket = io.sockets.sockets.get(existingSocketId);
    if (existingSocket) {
      // Instead of disconnecting, transfer the room data
      console.log(`Transferring connection for ${username} from ${existingSocketId} to ${socket.id}`);
      const rooms = Array.from(existingSocket.rooms).filter(r => r !== existingSocketId);
      rooms.forEach(room => {
        existingSocket.leave(room);
        socket.join(room);
        // Sync room state after transfer
        syncRoomState(room);
      });
      // Update the socket mapping
      connectedUsers.set(username, socket.id);
      socketToUser.set(socket.id, username);
      socketToUser.delete(existingSocketId);
      // Let the old socket disconnect naturally
      existingSocket.disconnect();
    }
  }

  // Store new connection
  connectedUsers.set(username, socket.id);
  socketToUser.set(socket.id, username);
  console.log(`User connected: ${username} (Socket ID: ${socket.id})`);

  // Handle user registration
  socket.on('register', ({ username }, callback) => {
    console.log(`User registration request from: ${username} (Socket ID: ${socket.id})`);
    if (username && socket.id) {
      // Update user tracking
      connectedUsers.set(username, socket.id);
      socketToUser.set(socket.id, username);
      console.log(`User registered successfully: ${username}`);
      
      // Ensure callback is called with success
      if (typeof callback === 'function') {
        callback({ success: true });
      } else {
        console.error(`Registration callback not provided for user: ${username}`);
      }
    } else {
      console.error(`Registration failed for user: ${username}`);
      if (typeof callback === 'function') {
        callback({ success: false });
      }
    }
  });

  // Add getRoomState handler
  socket.on('getRoomState', ({ room }) => {
    console.log(`${username} requesting state for room: ${room}`);
    const roomInfo = rooms.get(room);
    if (roomInfo) {
      // Sync room state before sending
      syncRoomState(room);
      socket.emit('roomState', {
        room,
        players: roomInfo.players
      });
    } else {
      // If room doesn't exist, create it with current player
      rooms.set(room, {
        players: [username],
        lastUpdated: Date.now()
      });
      socket.emit('roomState', {
        room,
        players: [username]
      });
    }
  });

  // Handle room joins
  socket.on('joinRoom', ({ room, username, roomData }) => {
    console.log(`${username} joining room: ${room} (Socket ID: ${socket.id})`);
    
    // Leave previous room if any
    if (socket.rooms.size > 1) {
      const previousRoom = Array.from(socket.rooms).find(r => r !== socket.id);
      if (previousRoom) {
        console.log(`${username} leaving previous room: ${previousRoom}`);
        socket.leave(previousRoom);
        syncRoomState(previousRoom);
      }
    }

    // Join new room
    socket.join(room);
    console.log(`${username} joined room: ${room}`);
    
    // Initialize or update room data
    if (!rooms.has(room)) {
      console.log(`Creating new room: ${room}`);
      rooms.set(room, {
        players: [username],
        lastUpdated: Date.now()
      });
    } else {
      // Add player to existing room if not already present
      const roomInfo = rooms.get(room);
      if (!roomInfo.players.includes(username)) {
        roomInfo.players.push(username);
        roomInfo.lastUpdated = Date.now();
        rooms.set(room, roomInfo);
      }
    }

    // Sync room state after join
    syncRoomState(room);

    // Send confirmation to the joining player with current room state
    const currentRoomState = rooms.get(room);
    socket.emit('roomJoined', {
      room,
      players: currentRoomState.players
    });

    // Notify all clients in the room about the new player
    broadcastToRoom(room, 'playerJoined', {
      room,
      username,
      players: currentRoomState.players
    });
  });

  // Handle room leaves
  socket.on('leaveRoom', ({ username, room }) => {
    console.log(`${username} leaving room: ${room}`);
    socket.leave(room);
    syncRoomState(room);
  });

  // Handle chat messages
  socket.on('chat', ({ room, message, username }) => {
    console.log(`Chat from ${username} in ${room}:`, message);
    broadcastToRoom(room, 'chat', { username, message, room });
  });

  // Handle emotes
  socket.on('emote', ({ room, emote, username }) => {
    console.log(`Emote from ${username} in ${room}:`, emote);
    broadcastToRoom(room, 'emote', { username, emote });
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ from, to, signal }) => {
    console.log(`Signal from ${from} to ${to} (type: ${signal.type})`);
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Forwarding signal to ${to} (Socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('signal', { from, signal });
    } else {
      console.warn(`Target user ${to} not found for signal. Current users:`, Array.from(connectedUsers.entries()));
    }
  });

  // Handle room build requests
  socket.on('queueRoomBuild', ({ room, newRoom, exits }, callback) => {
    console.log('\n=== New Room Build Request ===');
    console.log(`Builder: ${username}`);
    console.log(`From Room: ${room.author}/${room.permlink}`);
    console.log(`New Room: ${newRoom.author}/${newRoom.permlink}`);
    console.log('Exits:');
    console.log('- From New Room:', exits.fromNewRoom);
    console.log('- From Current Room:', exits.fromCurrentRoom);
    
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
    console.log('\n=== Room Build Approval ===');
    console.log(`Queue ID: ${queueId}`);
    
    const buildRequest = roomBuildQueue.get(queueId);
    if (buildRequest) {
      console.log(`Approving build request from ${buildRequest.username}`);
      console.log(`New Room: ${buildRequest.newRoom.author}/${buildRequest.newRoom.permlink}`);
      
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
      console.log(`Build request ${queueId} not found in queue`);
    }
  });

  // Handle room build rejections
  socket.on('rejectRoomBuild', ({ queueId, reason }) => {
    console.log('\n=== Room Build Rejection ===');
    console.log(`Queue ID: ${queueId}`);
    console.log(`Reason: ${reason}`);
    
    const buildRequest = roomBuildQueue.get(queueId);
    if (buildRequest) {
      console.log(`Rejecting build request from ${buildRequest.username}`);
      console.log(`New Room: ${buildRequest.newRoom.author}/${buildRequest.newRoom.permlink}`);
      
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
      console.log(`Build request ${queueId} not found in queue`);
    }
  });

  // Handle queue status requests
  socket.on('getBuildQueue', () => {
    console.log('\n=== Queue Status Request ===');
    console.log(`Requested by: ${username}`);
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

  // Helper to broadcast to builders
  const broadcastToBuilders = (event, data) => {
    io.sockets.sockets.forEach(socket => {
      const socketUsername = socketToUser.get(socket.id);
      if (socketUsername === config.game.accountName) {
        socket.emit(event, data);
      }
    });
  };

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      handleUserDisconnect(username, socket);
    }
  });
});

// Add a basic HTTP GET route for the root path
app.get('/', (req, res) => {
  res.sendStatus(200); // Respond with a 200 OK status for health checks
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});