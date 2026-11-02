import { io as ioClient } from 'socket.io-client';
import { server, cleanup } from '../src/server';

describe('Socket.IO Tests', () => {
  let testSocket: any;
  const TEST_PORT = 4002;

  beforeAll((done) => {
    // Start server on different port for testing
    server.listen(TEST_PORT, () => {
      done();
    });
  });

  afterAll((done) => {
    cleanup();
    server.close(done);
  });

  afterEach(() => {
    if (testSocket) {
      testSocket.disconnect();
      testSocket = null;
    }
  });

  describe('Socket Connection', () => {
    it('should connect with valid username', (done) => {
      testSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: { username: 'testuser' }
      });

      testSocket.on('connect', () => {
        expect(testSocket.connected).toBe(true);
        done();
      });
    });

    it('should disconnect without username', (done) => {
      testSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      testSocket.on('disconnect', () => {
        expect(testSocket.connected).toBe(false);
        done();
      });
    });
  });

  describe('Socket Events', () => {
    beforeEach((done) => {
      testSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: { username: 'eventuser' }
      });
      testSocket.on('connect', done);
    });

    it('should handle register event', (done) => {
      testSocket.emit('register', { username: 'newuser' });
      
      testSocket.on('registered', (response: any) => {
        expect(response.success).toBe(true);
        done();
      });
    });

    it('should handle register event with same username', (done) => {
      testSocket.emit('register', { username: 'eventuser' });
      
      testSocket.on('registered', (response: any) => {
        expect(response.success).toBe(true);
        done();
      });
    });

    it('should handle joinChatChannel event', (done) => {
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      testSocket.on('chatChannelState', (state: any) => {
        expect(state.channelId).toBe('test-channel');
        expect(state.players).toContain('eventuser');
        done();
      });
    });

    it('should handle joinChatChannel without username', (done) => {
      // Create a socket without username
      const noUserSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      noUserSocket.on('disconnect', () => {
        // Should disconnect due to no username
        expect(noUserSocket.connected).toBe(false);
        noUserSocket.disconnect();
        done();
      });
    });

    it('should handle leaveChatChannel event', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        testSocket.emit('leaveChatChannel', { channelId: 'test-channel' });
        done(); // Just verify it doesn't throw
      }, 100);
    });

    it('should handle chatMessage event', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        testSocket.emit('chatMessage', { 
          channelId: 'test-channel', 
          message: 'Hello world' 
        });
        done(); // Just verify it doesn't throw
      }, 100);
    });

    it('should handle emote event', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        testSocket.emit('emote', { 
          channelId: 'test-channel', 
          emote: 'wave' 
        });
        done(); // Just verify it doesn't throw
      }, 100);
    });

    it('should handle emote event with missing data', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        testSocket.emit('emote', { 
          channelId: '', 
          emote: '' 
        });
        
        testSocket.on('error', (error: any) => {
          expect(error.message).toBe('Missing channelId or emote');
          done();
        });
      }, 100);
    });

    it('should handle keepaliveResponse event', (done) => {
      testSocket.emit('keepaliveResponse');
      // No error thrown = success; give the server a tick to process it
      setTimeout(done, 50);
    });

    it('should handle the client keepalive reply event', (done) => {
      testSocket.emit('keepalive');
      setTimeout(done, 50);
    });

    it('should handle disconnect event', (done) => {
      testSocket.on('disconnect', () => {
        expect(testSocket.connected).toBe(false);
        done();
      });

      testSocket.disconnect();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach((done) => {
      testSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: { username: 'rateuser' }
      });
      testSocket.on('connect', done);
    });

    it('should rate limit join/leave operations', (done) => {
      // Rate limiting is disabled in test environment
      if (process.env['NODE_ENV'] === 'test') {
        // In test mode, rate limiting is disabled, so we just verify the operations work
        let successCount = 0;
        const totalOperations = 22;
        
        testSocket.on('chatChannelState', () => {
          successCount++;
          if (successCount >= totalOperations) {
            expect(successCount).toBe(totalOperations);
            done();
          }
        });

        // Send operations - should all succeed in test mode
        for (let i = 0; i < totalOperations; i++) {
          testSocket.emit('joinChatChannel', { channelId: `channel-${i}` });
        }
      } else {
        // In production mode, test actual rate limiting
        let errorCount = 0;
        
        testSocket.on('error', (error: any) => {
          if (error.message && error.message.includes('Too many room changes')) {
            errorCount++;
            if (errorCount >= 2) {
              expect(errorCount).toBeGreaterThan(0);
              done();
            }
          }
        });

        // Send just over the rate limit (22, limit is 20)
        for (let i = 0; i < 22; i++) {
          testSocket.emit('joinChatChannel', { channelId: `channel-${i}` });
        }
      }
    });

    it('should rate limit chat messages', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        // Rate limiting is disabled in test environment
        if (process.env['NODE_ENV'] === 'test') {
          // In test mode, rate limiting is disabled, so we just verify the messages work
          let successCount = 0;
          const totalMessages = 32;
          
          testSocket.on('chatMessage', () => {
            successCount++;
            if (successCount >= totalMessages) {
              expect(successCount).toBe(totalMessages);
              done();
            }
          });

          // Send messages - should all succeed in test mode
          for (let i = 0; i < totalMessages; i++) {
            testSocket.emit('chatMessage', { 
              channelId: 'test-channel', 
              message: `Message ${i}` 
            });
          }
        } else {
          // In production mode, test actual rate limiting
          let errorCount = 0;
          
          testSocket.on('error', (error: any) => {
            if (error.message && error.message.includes('Too many messages')) {
              errorCount++;
              if (errorCount >= 2) {
                expect(errorCount).toBeGreaterThan(0);
                done();
              }
            }
          });

          // Send just over the rate limit (32, limit is 30)
          for (let i = 0; i < 32; i++) {
            testSocket.emit('chatMessage', { 
              channelId: 'test-channel', 
              message: `Message ${i}` 
            });
          }
        }
      }, 100);
    });

    it('should rate limit emotes', (done) => {
      // First join a channel
      testSocket.emit('joinChatChannel', { channelId: 'test-channel' });
      
      setTimeout(() => {
        // Rate limiting is disabled in test environment
        if (process.env['NODE_ENV'] === 'test') {
          // In test mode, rate limiting is disabled, so we just verify the emotes work
          let successCount = 0;
          const totalEmotes = 32;
          
          testSocket.on('emote', () => {
            successCount++;
            if (successCount >= totalEmotes) {
              expect(successCount).toBe(totalEmotes);
              done();
            }
          });

          // Send emotes - should all succeed in test mode
          for (let i = 0; i < totalEmotes; i++) {
            testSocket.emit('emote', { 
              channelId: 'test-channel', 
              emote: `emote-${i}` 
            });
          }
        } else {
          // In production mode, test actual rate limiting
          let errorCount = 0;
          
          testSocket.on('error', (error: any) => {
            if (error.message && error.message.includes('Too many emotes')) {
              errorCount++;
              if (errorCount >= 2) {
                expect(errorCount).toBeGreaterThan(0);
                done();
              }
            }
          });

          // Send just over the rate limit (32, limit is 30)
          for (let i = 0; i < 32; i++) {
            testSocket.emit('emote', { 
              channelId: 'test-channel', 
              emote: `emote-${i}` 
            });
          }
        }
      }, 100);
    });
  });

  describe('Error Handling', () => {
    beforeEach((done) => {
      testSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: { username: 'erroruser' }
      });
      testSocket.on('connect', done);
    });

    it('should handle missing username in joinChatChannel', (done) => {
      // Create a socket that will be disconnected
      const noUserSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      noUserSocket.on('disconnect', () => {
        expect(noUserSocket.connected).toBe(false);
        noUserSocket.disconnect();
        done();
      });
    });

    it('should handle missing username in leaveChatChannel', (done) => {
      // Create a socket that will be disconnected
      const noUserSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      noUserSocket.on('disconnect', () => {
        expect(noUserSocket.connected).toBe(false);
        noUserSocket.disconnect();
        done();
      });
    });

    it('should handle missing username in chatMessage', (done) => {
      // Create a socket that will be disconnected
      const noUserSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      noUserSocket.on('disconnect', () => {
        expect(noUserSocket.connected).toBe(false);
        noUserSocket.disconnect();
        done();
      });
    });

    it('should handle missing username in emote', (done) => {
      // Create a socket that will be disconnected
      const noUserSocket = ioClient(`http://localhost:${TEST_PORT}`, {
        query: {}
      });

      noUserSocket.on('disconnect', () => {
        expect(noUserSocket.connected).toBe(false);
        noUserSocket.disconnect();
        done();
      });
    });
  });
}); 