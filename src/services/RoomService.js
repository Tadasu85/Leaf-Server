class RoomService {
  constructor(io, logger) {
    this.io = io;
    this.logger = logger;
    this.rooms = new Map(); // Room ID -> Room Data
    this.roomPlayers = new Map(); // Room ID -> Set of Player Usernames
  }

  // Handle user disconnection
  handleDisconnection(socket) {
    // Room cleanup is handled by ChatService for chat channels
    // This service handles game room state if needed
  }

  // Join a room
  joinRoom(socket, data) {
    const { roomId, username } = data;
    
    if (!roomId || !username) {
      socket.emit('error', { message: 'Missing roomId or username' });
      return;
    }

    // Initialize room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        players: [],
        lastUpdated: Date.now()
      });
      this.roomPlayers.set(roomId, new Set());
    }

    const room = this.rooms.get(roomId);
    const roomPlayerSet = this.roomPlayers.get(roomId);
    
    // Add player to room
    roomPlayerSet.add(username);
    room.players = Array.from(roomPlayerSet);
    room.lastUpdated = Date.now();

    // Join socket room
    socket.join(roomId);
    
    // Broadcast room update to all players in the room
    this.io.to(roomId).emit('roomUpdate', {
      room: roomId,
      players: room.players,
      lastUpdated: room.lastUpdated
    });

    this.logger.info(`User ${username} joined room ${roomId}`);
  }

  // Leave a room
  leaveRoom(socket, data) {
    const { roomId, username } = data;
    
    if (!roomId || !username) {
      socket.emit('error', { message: 'Missing roomId or username' });
      return;
    }

    const room = this.rooms.get(roomId);
    const roomPlayerSet = this.roomPlayers.get(roomId);
    
    if (room && roomPlayerSet) {
      // Remove player from room
      roomPlayerSet.delete(username);
      room.players = Array.from(roomPlayerSet);
      room.lastUpdated = Date.now();

      // Leave socket room
      socket.leave(roomId);
      
      // Clean up empty rooms
      if (roomPlayerSet.size === 0) {
        this.rooms.delete(roomId);
        this.roomPlayers.delete(roomId);
        this.logger.info(`Cleaned up empty room: ${roomId}`);
      } else {
        // Broadcast playerLeft event to remaining players
        this.io.to(roomId).emit('playerLeft', {
          username,
          room: roomId,
          players: room.players
        });
      }
    }

    this.logger.info(`User ${username} left room ${roomId}`);
  }

  // Update room data
  updateRoomData(roomId, data) {
    const room = this.rooms.get(roomId);
    if (room) {
      // Merge existing room data with new data
      const updatedRoomInfo = {
        ...room,
        body: data.body || data.description || room.body,
        title: data.title || room.title,
        exits: data.exits || room.exits,
        details: data.details || room.details,
        author: data.author || room.author,
        permlink: data.permlink || room.permlink,
        lastUpdated: Date.now()
      };
      
      this.rooms.set(roomId, updatedRoomInfo);
      
      // Broadcast updated room data to all players in the room
      this.io.to(roomId).emit('roomUpdate', {
        ...updatedRoomInfo,
        room: roomId
      });
      
      this.logger.info(`Room ${roomId} data updated`);
    } else {
      // Create new room if it doesn't exist
      const newRoom = {
        id: roomId,
        players: [],
        body: data.body || data.description,
        title: data.title,
        exits: data.exits,
        details: data.details,
        author: data.author,
        permlink: data.permlink,
        lastUpdated: Date.now()
      };
      
      this.rooms.set(roomId, newRoom);
      this.roomPlayers.set(roomId, new Set());
      
      this.logger.info(`Created new room ${roomId} with data`);
    }
  }

  // Get room info
  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      return {
        ...room,
        players: Array.from(room.players)
      };
    }
    return null;
  }

  // Get all rooms
  getAllRooms() {
    return Array.from(this.rooms.entries()).map(([id, room]) => ({
      ...room,
      id,
      players: Array.from(room.players)
    }));
  }

  // Get players in room
  getPlayersInRoom(roomId) {
    const roomPlayerSet = this.roomPlayers.get(roomId);
    return roomPlayerSet ? Array.from(roomPlayerSet) : [];
  }

  // Check if player is in room
  isPlayerInRoom(roomId, username) {
    const roomPlayerSet = this.roomPlayers.get(roomId);
    return roomPlayerSet ? roomPlayerSet.has(username) : false;
  }

  // Broadcast room update
  broadcastRoomUpdate(roomId, data) {
    this.logger.debug(`Broadcasting room update to ${roomId}:`, data);
    this.io.to(roomId).emit('roomUpdate', data);
  }

  // Get service status
  getStatus() {
    return {
      activeRooms: this.rooms.size,
      totalPlayers: Array.from(this.roomPlayers.values())
        .reduce((total, players) => total + players.size, 0),
      rooms: Array.from(this.rooms.keys())
    };
  }
}

module.exports = RoomService; 