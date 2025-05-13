const { Server } = require('socket.io');
const http = require('http');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'], // Enable both WebSocket and polling
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000, // Increase ping interval
  connectTimeout: 45000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e8
});

// Store room data
const rooms = new Map();

// Track connected users and their socket IDs
const connectedUsers = new Map();
const socketToUser = new Map();

// Helper to get room ID
const getRoomId = (author, permlink) => `${author}/${permlink}`;

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
  
  // Remove from user tracking
  connectedUsers.delete(username);
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
      });
      // Update the socket mapping
      connectedUsers.set(username, socket.id);
      socketToUser.set(socket.id, username);
      socketToUser.delete(existingSocketId);
      // Let the old socket disconnect naturally
      existingSocket.disconnect();
      return;
    }
  }

  // Store new connection
  connectedUsers.set(username, socket.id);
  socketToUser.set(socket.id, username);
  console.log(`User connected: ${username} (Socket ID: ${socket.id})`);

  // Handle room joins
  socket.on('joinRoom', ({ room, username, roomData }) => {
    console.log(`${username} joining room: ${room} (Socket ID: ${socket.id})`);
    
    // Leave previous room if any
    if (socket.rooms.size > 1) {
      const previousRoom = Array.from(socket.rooms).find(r => r !== socket.id);
      if (previousRoom) {
        console.log(`${username} leaving previous room: ${previousRoom}`);
        socket.leave(previousRoom);
        const prevRoomInfo = rooms.get(previousRoom);
        if (prevRoomInfo) {
          prevRoomInfo.players = prevRoomInfo.players.filter(p => p !== username);
          cleanupRoom(previousRoom);
          
          // Notify remaining players
          broadcastToRoom(previousRoom, 'roomUpdate', {
            room: previousRoom,
            players: prevRoomInfo.players
          });
        }
      }
    }

    // Join new room
    socket.join(room);
    console.log(`${username} joined room: ${room}`);
    
    // Initialize or update room data
    if (!rooms.has(room)) {
      console.log(`Creating new room: ${room}`);
      rooms.set(room, {
        players: [],
        lastUpdated: Date.now(),
        messages: []
      });
    }

    const roomInfo = rooms.get(room);
    
    // Update room data with new information
    if (roomData) {
      roomInfo.lastUpdated = Date.now();
      // Merge players list, ensuring no duplicates
      const allPlayers = new Set([...roomInfo.players, ...roomData.players, username]);
      roomInfo.players = Array.from(allPlayers);
    } else if (!roomInfo.players.includes(username)) {
      roomInfo.players.push(username);
    }

    // Send recent messages to the new player
    if (roomInfo.messages && roomInfo.messages.length > 0) {
      console.log(`Sending ${roomInfo.messages.length} messages to ${username}`);
      socket.emit('messageHistory', {
        room,
        messages: roomInfo.messages.slice(-50)
      });
    }

    // Broadcast room update to all players in the room
    broadcastToRoom(room, 'roomUpdate', {
      room,
      players: roomInfo.players
    });

    // Send confirmation to the joining player
    socket.emit('roomJoined', {
      room,
      players: roomInfo.players
    });
  });

  // Handle room leaves
  socket.on('leaveRoom', ({ username, room }) => {
    console.log(`${username} leaving room: ${room}`);
    socket.leave(room);
    
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
  });

  // Handle chat messages
  socket.on('chat', ({ room, message, username }) => {
    console.log(`Chat from ${username} in ${room}:`, message);
    const roomInfo = rooms.get(room);
    if (roomInfo) {
      // Store message in room history
      const chatMessage = {
        type: 'chat',
        username,
        message,
        timestamp: Date.now()
      };
      roomInfo.messages = [...(roomInfo.messages || []), chatMessage].slice(-100);
      
      // Broadcast to room
      broadcastToRoom(room, 'chat', chatMessage);
    } else {
      console.warn(`Room ${room} not found for chat message`);
      // Create room if it doesn't exist
      console.log(`Creating room ${room} for chat message`);
      rooms.set(room, {
        players: [username],
        lastUpdated: Date.now(),
        messages: [{
          type: 'chat',
          username,
          message,
          timestamp: Date.now()
        }]
      });
      socket.join(room);
      broadcastToRoom(room, 'chat', {
        type: 'chat',
        username,
        message,
        timestamp: Date.now()
      });
    }
  });

  // Handle emotes
  socket.on('emote', ({ room, emote, username }) => {
    console.log(`Emote from ${username} in ${room}:`, emote);
    const roomInfo = rooms.get(room);
    if (roomInfo) {
      // Store emote in room history
      const emoteMessage = {
        type: 'emote',
        username,
        emote,
        timestamp: Date.now()
      };
      roomInfo.messages = [...(roomInfo.messages || []), emoteMessage].slice(-100);
      
      // Broadcast to room
      broadcastToRoom(room, 'emote', emoteMessage);
    } else {
      console.warn(`Room ${room} not found for emote`);
      // Create room if it doesn't exist
      console.log(`Creating room ${room} for emote`);
      rooms.set(room, {
        players: [username],
        lastUpdated: Date.now(),
        messages: [{
          type: 'emote',
          username,
          emote,
          timestamp: Date.now()
        }]
      });
      socket.join(room);
      broadcastToRoom(room, 'emote', {
        type: 'emote',
        username,
        emote,
        timestamp: Date.now()
      });
    }
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ from, to, signal }) => {
    console.log(`Signal from ${from} to ${to}`);
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('signal', { from, signal });
    } else {
      console.warn(`Target user ${to} not found for signal`);
    }
  });

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
