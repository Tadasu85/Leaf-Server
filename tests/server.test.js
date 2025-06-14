const { io: Client } = require('socket.io-client');

let clientSocket;

beforeAll((done) => {
  // Connect to the running server
  clientSocket = new Client('http://localhost:4001', {
    transports: ['websocket'],
    query: { username: 'testuser' }
  });
  
  clientSocket.on('connect', done);
});

afterEach((done) => {
  // Clean up after each test
  if (clientSocket.connected) {
    clientSocket.disconnect();
  }
  done();
});

afterAll((done) => {
  // Clean up all connections
  if (clientSocket.connected) {
    clientSocket.disconnect();
  }
  done();
});

describe('Socket Connection Tests', () => {
  test('should connect with valid username', (done) => {
    clientSocket.emit('register', { username: 'testuser' }, (response) => {
      expect(response.success).toBe(true);
      done();
    });
  });

  test('should not connect without username', (done) => {
    const socketWithoutUsername = new Client('http://localhost:4001');
    socketWithoutUsername.on('disconnect', () => {
      expect(socketWithoutUsername.connected).toBe(false);
      socketWithoutUsername.close();
      done();
    });
  });
});

describe('Room Management Tests', () => {
  test('should join room successfully', (done) => {
    const roomId = 'testroom';
    clientSocket.emit('joinRoom', roomId);
    
    clientSocket.on('roomUpdate', (data) => {
      expect(data.room).toBe(roomId);
      expect(data.players).toContain('testuser');
      done();
    });
  });

  test('should handle room state request', (done) => {
    const roomId = 'testroom';
    clientSocket.emit('getRoomState', { room: roomId });
    
    clientSocket.on('roomState', (data) => {
      expect(data.room).toBe(roomId);
      expect(data.players).toBeDefined();
      done();
    });
  });

  test('should handle room leave', (done) => {
    const roomId = 'testroom';
    clientSocket.emit('leaveRoom', { username: 'testuser', room: roomId });
    
    clientSocket.on('playerLeft', (data) => {
      expect(data.room).toBe(roomId);
      expect(data.username).toBe('testuser');
      done();
    });
  });
});

describe('Chat and Emote Tests', () => {
  test('should broadcast chat message', (done) => {
    const roomId = 'testroom';
    const message = 'Hello, world!';
    
    clientSocket.emit('chat', {
      room: roomId,
      message: message,
      username: 'testuser'
    });
    
    clientSocket.on('chat', (data) => {
      expect(data.room).toBe(roomId);
      expect(data.message).toBe(message);
      expect(data.username).toBe('testuser');
      done();
    });
  });

  test('should broadcast emote', (done) => {
    const roomId = 'testroom';
    const emote = 'waves';
    
    clientSocket.emit('emote', {
      room: roomId,
      emote: emote,
      username: 'testuser'
    });
    
    clientSocket.on('emote', (data) => {
      expect(data.room).toBe(roomId);
      expect(data.emote).toBe(emote);
      expect(data.username).toBe('testuser');
      done();
    });
  });
});

describe('Room Build Queue Tests', () => {
  test('should queue room build request', (done) => {
    const buildRequest = {
      room: { author: 'testuser', permlink: 'oldroom' },
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
    clientSocket.emit('getBuildQueue');
    
    clientSocket.on('buildQueueStatus', (data) => {
      expect(Array.isArray(data)).toBe(true);
      done();
    });
  });
}); 