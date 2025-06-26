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

// Store chat channel data - simplified structure for real-time communication only
const chatChannels = new Map();

// Track connected users and their socket IDs
const connectedUsers = new Map();
const socketToUser = new Map();

// Admin accounts that should never appear as players
const ADMIN_ACCOUNTS = config.admins;

// Helper to filter out admin accounts from player lists
const filterAdminAccounts = (players) => {
  return players.filter(player => !ADMIN_ACCOUNTS.includes(player));
};

// Helper to get channel ID from game location
const getChannelId = (author, permlink) => `${author}/${permlink}`;

// Helper to clean up empty chat channels
const cleanupChatChannel = (channelId) => {
  const channel = chatChannels.get(channelId);
  if (channel && channel.players.length === 0) {
    log(`Cleaning up empty chat channel: ${channelId}`);
    chatChannels.delete(channelId);
  }
};

// Helper to broadcast to chat channel
const broadcastToChannel = (channelId, event, data) => {
  log(`Broadcasting ${event} to chat channel ${channelId}:`, data);
  io.to(channelId).emit(event, data);
};

// Helper to handle user disconnection
const handleUserDisconnect = (username, socket) => {
  log(`Handling disconnect for user: ${username} (Socket ID: ${socket.id})`);
  
  // Get all chat channels the user was in before removing tracking
  const userChannels = Array.from(socket.rooms).filter(r => r !== socket.id);
  
  // Only remove from tracking if this is the last socket for this user
  const currentSocketId = connectedUsers.get(username);
  if (currentSocketId === socket.id) {
    log(`Removing user tracking for ${username}`);
    connectedUsers.delete(username);
  }
  socketToUser.delete(socket.id);
  
  // Remove from all chat channels and update channel states
  userChannels.forEach(channelId => {
    log(`Removing ${username} from chat channel ${channelId} due to disconnect`);
    const channelInfo = chatChannels.get(channelId);
    if (channelInfo) {
      // Get current players in channel from socket connections
      const channelSockets = io.sockets.adapter.rooms.get(channelId);
      let playersInChannel = [];
      if (channelSockets) {
        playersInChannel = Array.from(channelSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }
      
      // Update channel state with current players
      channelInfo.players = playersInChannel;
      chatChannels.set(channelId, channelInfo);
      
      // Clean up empty channels
      cleanupChatChannel(channelId);
      
      // Broadcast channel update to remaining players
      broadcastToChannel(channelId, 'playerLeft', {
        username,
        players: channelInfo.players,
        channelId
      });
    }
  });
};

// Helper to log chat channel state
const logChatChannelState = (channelId, action) => {
  const channel = chatChannels.get(channelId);
  log(`\n=== Chat Channel State (${action}) ===`);
  log(`Channel ID: ${channelId}`);
  if (channel) {
    log(`Players (${channel.players ? channel.players.length : 0}): ${channel.players ? channel.players.join(', ') : 'None'}`);
    log(`Last Updated: ${channel.lastUpdated ? new Date(channel.lastUpdated).toLocaleString() : 'Not set'}`);
    log('Full Channel Data:', channel);
  } else {
    log('Chat channel not found');
  }
  log('===========================\n');
};

// Helper to log player state
const logPlayerState = (username, action) => {
  log(`\n=== Player State (${action}) ===`);
  log(`Username: ${username}`);
  log(`Socket ID: ${connectedUsers.get(username)}`);
  const playerChannels = Array.from(socketToUser.entries())
    .filter(([_, name]) => name === username)
    .map(([socketId]) => Array.from(io.sockets.sockets.get(socketId)?.rooms || []))
    .flat()
    .filter(channel => channel !== connectedUsers.get(username));
  log(`Current Chat Channels: ${playerChannels.join(', ')}`);
  log('===========================\n');
};

// Helper to sync chat channel state
const syncChatChannelState = (channelId) => {
  const channelInfo = chatChannels.get(channelId);
  if (channelInfo) {
    // Get all sockets in the channel
    const channelSockets = io.sockets.adapter.rooms.get(channelId);
    if (channelSockets) {
      // Get current channel state without broadcasting to all players
      let playersInChannel = [];
      if (channelSockets) {
        playersInChannel = Array.from(channelSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      log('Players in chat channel:', playersInChannel);

      // Update channel state with current players
      const updatedChannelInfo = {
        ...channelInfo,
        players: playersInChannel,
        lastUpdated: Date.now()
      };
      chatChannels.set(channelId, updatedChannelInfo);

      // Log channel state change
      logChatChannelState(channelId, 'sync');

      // Broadcast updated state to all players with consistent format
      broadcastToChannel(channelId, 'channelUpdate', {
        ...updatedChannelInfo,
        channelId
      });

      return updatedChannelInfo;
    }
  }
  return channelInfo;
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

  // Add getChatChannelState handler
  socket.on('getChatChannelState', ({ channelId }) => {
    const username = socketToUser.get(socket.id);
    if (!username) {
      log('Error: Attempted to get chat channel state without username');
      return;
    }
    
    log(`${username} requesting state for chat channel: ${channelId}`);
    const channelInfo = chatChannels.get(channelId);
    if (channelInfo) {
      // Get current channel state without broadcasting to all players
      const channelSockets = io.sockets.adapter.rooms.get(channelId);
      let playersInChannel = [];
      if (channelSockets) {
        playersInChannel = Array.from(channelSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      // Create channel state without broadcasting
      const currentChannelInfo = {
        ...channelInfo,
        players: playersInChannel,
        lastUpdated: Date.now()
      };
      
      // Update channel state without broadcasting
      chatChannels.set(channelId, currentChannelInfo);
      
      // Send channel state only to the requesting socket
      socket.emit('chatChannelState', {
        ...currentChannelInfo,
        channelId
      });
    } else {
      // If channel doesn't exist, create it with current player and join the socket
      const newChannelInfo = {
        players: ADMIN_ACCOUNTS.includes(username) ? [] : [username], // Don't add admin accounts as players
        lastUpdated: Date.now()
      };
      chatChannels.set(channelId, newChannelInfo);
      
      // Join the socket to the channel
      socket.join(channelId);
      socket.currentChannel = channelId;
      log(`${username} joined chat channel ${channelId} via getChatChannelState`);
      
      socket.emit('chatChannelState', {
        ...newChannelInfo,
        channelId
      });
    }
  });

  // Handle chat channel joining
  socket.on('joinChatChannel', (channelId) => {
    try {
      const username = socketToUser.get(socket.id);
      if (!username) {
        log('Error: Attempted to join chat channel without username');
        return;
      }

      // Leave current channel if any and notify other players
      if (socket.currentChannel) {
        const oldChannel = socket.currentChannel;
        socket.leave(oldChannel);
        log(`${username} left chat channel ${oldChannel}`);
        
        // Notify other players in the old channel that someone left
        const oldChannelSockets = io.sockets.adapter.rooms.get(oldChannel);
        if (oldChannelSockets) {
          const remainingPlayers = Array.from(oldChannelSockets)
            .map(socketId => socketToUser.get(socketId))
            .filter(Boolean)
            .filter(player => !ADMIN_ACCOUNTS.includes(player));
          
          // Update old channel state
          const oldChannelInfo = chatChannels.get(oldChannel);
          if (oldChannelInfo) {
            oldChannelInfo.players = remainingPlayers;
            oldChannelInfo.lastUpdated = Date.now();
            chatChannels.set(oldChannel, oldChannelInfo);
            
            // Broadcast to remaining players in old channel
            socket.to(oldChannel).emit('playerLeft', {
              username,
              players: remainingPlayers,
              channelId: oldChannel
            });
          }
        }
      }

      // Join new channel
      socket.join(channelId);
      socket.currentChannel = channelId;
      log(`${username} joined chat channel ${channelId}`);

      // Get current channel state or create new one
      const channelInfo = chatChannels.get(channelId) || {
        players: [],
        lastUpdated: Date.now()
      };

      // Calculate current players in channel from socket connections
      const channelSockets = io.sockets.adapter.rooms.get(channelId);
      let playersInChannel = [];
      if (channelSockets) {
        playersInChannel = Array.from(channelSockets)
          .map(socketId => socketToUser.get(socketId))
          .filter(Boolean)
          .filter(player => !ADMIN_ACCOUNTS.includes(player));
      }

      // Update channel state with current players
      const updatedChannelInfo = {
        ...channelInfo,
        players: playersInChannel, // Use actual players in channel, not stored players
        lastUpdated: Date.now()
      };
      
      // Update channel state
      chatChannels.set(channelId, updatedChannelInfo);

      // Log channel state change
      logChatChannelState(channelId, 'join');

      // Notify other players about the new player (but not the joining player)
      socket.to(channelId).emit('playerJoined', {
        username,
        players: updatedChannelInfo.players,
        channelId
      });

      // Send channel state only to the joining player
      socket.emit('chatChannelUpdate', {
        ...updatedChannelInfo,
        channelId
      });
    } catch (error) {
      log('Error in joinChatChannel:', error);
    }
  });

  // Handle chat channel leaves
  socket.on('leaveChatChannel', ({ username, channelId }) => {
    log(`\n=== Chat Channel Leave Event ===`);
    log(`Player: ${username}`);
    log(`Channel: ${channelId}`);
    log(`Socket ID: ${socket.id}`);
    
    if (!channelId || !username) {
      log('Invalid leave request - missing channel or username');
      return;
    }
    
    socket.leave(channelId);
    
    // Clear the current channel if it matches the channel being left
    if (socket.currentChannel === channelId) {
      socket.currentChannel = null;
      log(`${username} cleared current channel tracking`);
    }
    
    // Update channel state and notify remaining players
    const updatedChannelState = syncChatChannelState(channelId);
    if (updatedChannelState) {
      broadcastToChannel(channelId, 'playerLeft', {
        username,
        players: updatedChannelState.players,
        channelId
      });
    }
    
    // Log player state after leave
    logPlayerState(username, 'leave');
    log('=== End Chat Channel Leave Event ===\n');
  });

  // Handle chat messages
  socket.on('chat', ({ channelId, message, username }) => {
    if (!channelId || !username || !message) {
      log('Invalid chat message - missing channel, username, or message');
      return;
    }
    log(`\n=== Chat Event ===`);
    log(`Channel: ${channelId}`);
    log(`Player: ${username}`);
    log(`Message: ${message}`);
    log('=== End Chat Event ===\n');
    broadcastToChannel(channelId, 'chat', { username, message, channelId });
  });

  // Handle emotes
  socket.on('emote', ({ channelId, emote, username }) => {
    if (!channelId || !username || !emote) {
      log('Invalid emote - missing channel, username, or emote');
      return;
    }
    log(`\n=== Emote Event ===`);
    log(`Channel: ${channelId}`);
    log(`Player: ${username}`);
    log(`Emote: ${emote}`);
    log('=== End Emote Event ===\n');
    broadcastToChannel(channelId, 'emote', { username, emote, channelId });
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