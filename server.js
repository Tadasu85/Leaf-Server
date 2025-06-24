const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');

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

// Admin accounts that should never appear as players
const ADMIN_ACCOUNTS = config.admins;

// Helper to filter out admin accounts from player lists
const filterAdminAccounts = (players) => {
  return players.filter(player => !ADMIN_ACCOUNTS.includes(player));
};

// Helper to get room ID
const getRoomId = (author, permlink) => `${author}/${permlink}`;

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
      // Get current players in room from socket connections
      const roomSockets = io.sockets.adapter.rooms.get(room);
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }
      
      // Update room state with current players
      roomInfo.players = playersInRoom;
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
    log(`Author: ${room.author || 'Not set'}`);
    log(`Permlink: ${room.permlink || 'Not set'}`);
    log(`Title: ${room.title || 'Not set'}`);
    log(`Body: ${room.body ? room.body.substring(0, 100) + '...' : 'Not set'}`);
    log(`Players (${room.players ? room.players.length : 0}): ${room.players ? room.players.join(', ') : 'None'}`);
    log(`Exits: ${room.exits ? Object.keys(room.exits).join(', ') : 'None'}`);
    log(`Details: ${room.details ? JSON.stringify(room.details) : 'None'}`);
    log(`Last Updated: ${room.lastUpdated ? new Date(room.lastUpdated).toLocaleString() : 'Not set'}`);
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
      // Get current room state without broadcasting to all players
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
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
        author: roomInfo.author || room.split('/')[0],
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
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      // Create room state without broadcasting
      const currentRoomInfo = {
        ...roomInfo,
        body: roomInfo.body || '',
        title: roomInfo.title || room,
        players: playersInRoom,
        details: roomInfo.details || {},
        exits: roomInfo.exits || {},
        author: roomInfo.author || room.split('/')[0],
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
        players: ADMIN_ACCOUNTS.includes(username) ? [] : [username], // Don't add admin accounts as players
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

      // Leave current room if any and notify other players
      if (socket.currentRoom) {
        const oldRoom = socket.currentRoom;
        socket.leave(oldRoom);
        log(`${username} left room ${oldRoom}`);
        
        // Notify other players in the old room that someone left
        const oldRoomSockets = io.sockets.adapter.rooms.get(oldRoom);
        if (oldRoomSockets) {
          const remainingPlayers = Array.from(oldRoomSockets)
            .map(socketId => socketToUser.get(socketId))
            .filter(Boolean)
            .filter(player => !ADMIN_ACCOUNTS.includes(player));
          
          // Update old room state
          const oldRoomInfo = rooms.get(oldRoom);
          if (oldRoomInfo) {
            oldRoomInfo.players = remainingPlayers;
            oldRoomInfo.lastUpdated = Date.now();
            rooms.set(oldRoom, oldRoomInfo);
            
            // Broadcast to remaining players in old room
            socket.to(oldRoom).emit('playerLeft', {
              username,
              players: remainingPlayers,
              room: oldRoom
            });
          }
        }
      }

      // Join new room
      socket.join(room);
      socket.currentRoom = room;
      log(`${username} joined room ${room}`);

      // Get current room state or create new one
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

      // Calculate current players in room from socket connections
      const roomSockets = io.sockets.adapter.rooms.get(room);
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      // Update room state with current players
      const updatedRoomInfo = {
        ...roomInfo,
        body: roomInfo.body || '',
        title: roomInfo.title || room,
        players: playersInRoom, // Use actual players in room, not stored players
        details: roomInfo.details || {},
        exits: roomInfo.exits || {},
        author: roomInfo.author || room.split('/')[0],
        permlink: roomInfo.permlink || room,
        lastUpdated: Date.now()
      };
      
      // Update room state
      rooms.set(room, updatedRoomInfo);

      // Log room state change
      logRoomState(room, 'join');

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

  // Handle room data updates from blockchain
  socket.on('updateRoomData', ({ room, roomData }) => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      log('Error: Attempted to update room data without username');
      return;
    }

    log(`\n=== Room Data Update ===`);
    log(`Room: ${room}`);
    log(`Updated by: ${username}`);
    log(`Room Data:`, roomData);

    const existingRoom = rooms.get(room);
    if (existingRoom) {
      // Get current players in room from socket connections
      const roomSockets = io.sockets.adapter.rooms.get(room);
      let playersInRoom = [];
      if (roomSockets) {
        playersInRoom = Array.from(roomSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      // Update existing room with blockchain data and current players
      const updatedRoomInfo = {
        ...existingRoom,
        body: roomData.body || roomData.description || existingRoom.body,
        title: roomData.title || existingRoom.title,
        exits: roomData.exits || existingRoom.exits,
        details: roomData.details || existingRoom.details,
        author: roomData.author || existingRoom.author,
        permlink: roomData.permlink || existingRoom.permlink,
        players: playersInRoom, // Use current players, not stored players
        lastUpdated: Date.now()
      };
      
      rooms.set(room, updatedRoomInfo);
      log(`Updated room data for ${room}`);
      logRoomState(room, 'blockchain-update');
      
      // Broadcast updated room data to all players in the room
      broadcastToRoom(room, 'roomUpdate', {
        ...updatedRoomInfo,
        room
      });
    } else {
      log(`Room ${room} not found, cannot update data`);
    }
    log('=== End Room Data Update ===\n');
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