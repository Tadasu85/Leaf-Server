const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');

let server;
let io;
let clientSocket;
let serverPort;

// Increase timeout for all tests
jest.setTimeout(60000);

beforeAll((done) => {
  const app = express();
  server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
    connectTimeout: 20000,
    allowUpgrades: true,
    maxHttpBufferSize: 1e6
  });

  // Initialize rooms Map
  const rooms = new Map();

  // Set up socket.io event handlers
  io.on('connection', (socket) => {
    const username = socket.handshake.query.username;
    console.log('New connection:', { username, socketId: socket.id });
    
    if (!username) {
      socket.disconnect();
      return;
    }

    socket.on('register', ({ username }, callback) => {
      console.log('Register event:', { username, socketId: socket.id });
      if (username && socket.id) {
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } else {
        if (typeof callback === 'function') {
          callback({ success: false });
        }
      }
    });

    socket.on('joinRoom', (room) => {
      console.log('Join room event:', { username, room, socketId: socket.id });
      socket.join(room);
      // Update room state
      const roomInfo = rooms.get(room) || { players: [] };
      if (!roomInfo.players.includes(username)) {
        roomInfo.players.push(username);
      }
      rooms.set(room, roomInfo);
      
      io.to(room).emit('roomUpdate', {
        room,
        players: roomInfo.players,
        lastUpdated: Date.now()
      });
    });

    socket.on('getRoomState', ({ room }) => {
      console.log('Get room state event:', { username, room, socketId: socket.id });
      const roomInfo = rooms.get(room) || { players: [] };
      socket.emit('roomState', {
        room,
        players: roomInfo.players,
        lastUpdated: Date.now()
      });
    });

    socket.on('leaveRoom', ({ username, room }) => {
      console.log('Leave room event:', { username, room, socketId: socket.id });
      socket.leave(room);
      
      // Get current room state
      const roomInfo = rooms.get(room) || { players: [] };
      console.log('Current room state:', roomInfo);
      
      // Remove the player from the room
      roomInfo.players = roomInfo.players.filter(p => p !== username);
      rooms.set(room, roomInfo);
      console.log('Updated room state:', roomInfo);
      
      // Emit playerLeft event to the room
      io.to(room).emit('playerLeft', {
        username,
        room,
        players: roomInfo.players
      });
      console.log('Emitted playerLeft event');
    });

    socket.on('chat', ({ room, message, username }) => {
      io.to(room).emit('chat', { username, message, room });
    });

    socket.on('emote', ({ room, emote, username }) => {
      io.to(room).emit('emote', { username, emote, room });
    });

    socket.on('queueRoomBuild', ({ room, newRoom, exits }, callback) => {
      if (callback) {
        callback({ queueId: Date.now().toString() });
      }
    });

    socket.on('getBuildQueue', () => {
      socket.emit('buildQueueStatus', []);
    });
  });

  server.listen(0, () => {
    serverPort = server.address().port;
    clientSocket = new Client(`http://localhost:${serverPort}`, {
      query: { username: 'testuser' },
      transports: ['websocket', 'polling']
    });
    done();
  });
});

afterEach((done) => {
  if (clientSocket && clientSocket.connected) {
    clientSocket.disconnect();
  }
  done();
});

afterAll((done) => {
  // Disconnect all sockets
  if (clientSocket && clientSocket.connected) {
    clientSocket.disconnect();
  }
  
  // Close the server
  server.close(() => {
    done();
  });
});

describe('Socket Connection Tests', () => {
  test('should connect with valid username', (done) => {
    const newSocket = new Client(`http://localhost:${serverPort}`, {
      transports: ['websocket', 'polling'],
      query: { username: 'newuser' }
    });

    newSocket.on('connect', () => {
      expect(newSocket.connected).toBe(true);
      newSocket.disconnect();
      done();
    });
  });

  test('should not connect without username', (done) => {
    const socketWithoutUsername = new Client(`http://localhost:${serverPort}`);
    
    socketWithoutUsername.on('disconnect', () => {
      expect(socketWithoutUsername.connected).toBe(false);
      done();
    });
  });
});

describe('Room Management Tests', () => {
  let testSocket;
  let observerSocket;

  beforeEach((done) => {
    if (!clientSocket.connected) {
      clientSocket.connect();
    }
    clientSocket.once('connect', () => {
      clientSocket.emit('register', { username: 'testuser' }, () => {
        clientSocket.emit('joinRoom', 'testroom');
        clientSocket.once('roomUpdate', () => {
          done();
        });
      });
    });
  });

  afterEach((done) => {
    if (testSocket && testSocket.connected) {
      testSocket.disconnect();
    }
    if (observerSocket && observerSocket.connected) {
      observerSocket.disconnect();
    }
    done();
  });

  test('should join room successfully', (done) => {
    // First disconnect and reconnect to ensure clean state
    clientSocket.disconnect();
    clientSocket.connect();
    
    clientSocket.once('connect', () => {
      clientSocket.emit('register', { username: 'testuser' }, () => {
        clientSocket.emit('joinRoom', 'testroom');
        clientSocket.once('roomUpdate', (data) => {
          expect(data.room).toBe('testroom');
          expect(Array.isArray(data.players)).toBe(true);
          expect(data.players).toContain('testuser');
          done();
        });
      });
    });
  });

  test('should handle room state request', (done) => {
    clientSocket.once('roomState', (data) => {
      expect(data.room).toBe('testroom');
      expect(Array.isArray(data.players)).toBe(true);
      expect(data.players).toContain('testuser');
      done();
    });
    clientSocket.emit('getRoomState', { room: 'testroom' });
  });

  test('should handle room leave', async () => {
    // Create two sockets - one to leave and one to observe
    testSocket = new Client(`http://localhost:${serverPort}`, {
      query: { username: 'testuser' },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    observerSocket = new Client(`http://localhost:${serverPort}`, {
      query: { username: 'observer' },
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    // Set up event handlers on the observer socket
    const playerLeftPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('playerLeft event not received within timeout'));
      }, 5000);

      observerSocket.on('playerLeft', (data) => {
        console.log('Observer received playerLeft event:', data);
        clearTimeout(timeout);
        expect(data.username).toBe('testuser');
        expect(data.room).toBe('testroom');
        expect(Array.isArray(data.players)).toBe(true);
        expect(data.players).not.toContain('testuser');
        resolve();
      });
    });

    // Connect and register both sockets
    await Promise.all([
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test socket connection timeout'));
        }, 5000);

        testSocket.once('connect', () => {
          clearTimeout(timeout);
          testSocket.emit('register', { username: 'testuser' }, resolve);
        });
      }),
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Observer socket connection timeout'));
        }, 5000);

        observerSocket.once('connect', () => {
          clearTimeout(timeout);
          observerSocket.emit('register', { username: 'observer' }, resolve);
        });
      })
    ]);

    // Join both sockets to the room
    await Promise.all([
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Test socket room join timeout'));
        }, 5000);

        testSocket.emit('joinRoom', 'testroom');
        testSocket.once('roomUpdate', (data) => {
          console.log('Test socket received roomUpdate after join:', data);
          clearTimeout(timeout);
          expect(data.room).toBe('testroom');
          expect(Array.isArray(data.players)).toBe(true);
          expect(data.players).toContain('testuser');
          resolve();
        });
      }),
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Observer socket room join timeout'));
        }, 5000);

        observerSocket.emit('joinRoom', 'testroom');
        observerSocket.once('roomUpdate', (data) => {
          console.log('Observer socket received roomUpdate after join:', data);
          clearTimeout(timeout);
          expect(data.room).toBe('testroom');
          expect(Array.isArray(data.players)).toBe(true);
          expect(data.players).toContain('testuser');
          expect(data.players).toContain('observer');
          resolve();
        });
      })
    ]);

    // Small delay to ensure room joins are processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Leave room with test socket
    console.log('Emitting leaveRoom event');
    testSocket.emit('leaveRoom', { username: 'testuser', room: 'testroom' });

    // Wait for playerLeft event on observer socket
    await playerLeftPromise;

    // Cleanup
    testSocket.disconnect();
    observerSocket.disconnect();
  }, 10000); // Increase test timeout to 10 seconds
});

describe('Chat and Emote Tests', () => {
  beforeEach((done) => {
    if (!clientSocket.connected) {
      clientSocket.connect();
    }
    clientSocket.once('connect', () => {
      clientSocket.emit('register', { username: 'testuser' }, () => {
        clientSocket.emit('joinRoom', 'testroom');
        clientSocket.once('roomUpdate', () => {
          done();
        });
      });
    });
  });

  test('should broadcast chat message', (done) => {
    const message = 'Hello, world!';
    clientSocket.once('chat', (data) => {
      expect(data.username).toBe('testuser');
      expect(data.message).toBe(message);
      expect(data.room).toBe('testroom');
      done();
    });
    clientSocket.emit('chat', { room: 'testroom', message, username: 'testuser' });
  });

  test('should broadcast emote', (done) => {
    const emote = 'wave';
    clientSocket.once('emote', (data) => {
      expect(data.username).toBe('testuser');
      expect(data.emote).toBe(emote);
      expect(data.room).toBe('testroom');
      done();
    });
    clientSocket.emit('emote', { room: 'testroom', emote, username: 'testuser' });
  });
});

describe('Room Build Queue Tests', () => {
  beforeEach((done) => {
    if (!clientSocket.connected) {
      clientSocket.connect();
    }
    clientSocket.once('connect', () => {
      clientSocket.emit('register', { username: 'testuser' }, () => {
        done();
      });
    });
  });

  test('should queue room build request', (done) => {
    const buildRequest = {
      room: { author: 'testuser', permlink: 'testroom' },
      newRoom: { author: 'testuser', permlink: 'newroom' },
      exits: {
        fromNewRoom: ['north'],
        fromCurrentRoom: ['south']
      }
    };

    clientSocket.emit('queueRoomBuild', buildRequest, (response) => {
      expect(response.queueId).toBeDefined();
      done();
    });
  });

  test('should get build queue status', (done) => {
    clientSocket.once('buildQueueStatus', (data) => {
      expect(Array.isArray(data)).toBe(true);
      done();
    });
    clientSocket.emit('getBuildQueue');
  });
}); 