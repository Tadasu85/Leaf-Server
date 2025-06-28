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
        players: new Set(),
        lastUpdated: Date.now()
      });
      this.roomPlayers.set(roomId, new Set());
    }

    const room = this.rooms.get(roomId);
    const roomPlayerSet = this.roomPlayers.get(roomId);
    
    // Add player to room
    roomPlayerSet.add(username);
    room.players = roomPlayerSet;
    room.lastUpdated = Date.now();

    // Join socket room
    socket.join(roomId);
    
    // Broadcast room update
    this.broadcastRoomUpdate(roomId, {
      type: 'playerJoined',
      username,
      players: Array.from(roomPlayerSet),
      roomId
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
      room.players = roomPlayerSet;
      room.lastUpdated = Date.now();

      // Leave socket room
      socket.leave(roomId);
      
      // Clean up empty rooms
      if (roomPlayerSet.size === 0) {
        this.rooms.delete(roomId);
        this.roomPlayers.delete(roomId);
        this.logger.info(`Cleaned up empty room: ${roomId}`);
      } else {
        // Broadcast room update
        this.broadcastRoomUpdate(roomId, {
          type: 'playerLeft',
          username,
          players: Array.from(roomPlayerSet),
          roomId
        });
      }
    }

    this.logger.info(`User ${username} left room ${roomId}`);
  }

  // Update room data
  updateRoomData(roomId, data) {
    const room = this.rooms.get(roomId);
    if (room) {
      Object.assign(room, data, { lastUpdated: Date.now() });
      this.broadcastRoomUpdate(roomId, {
        type: 'roomUpdated',
        roomId,
        data
      });
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