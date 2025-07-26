# Contributing to Leaf Server

Thank you for considering contributing to the Leaf Server! This document provides guidelines for contributing to the WebSocket signaling server that powers real-time communication for the Leaf text-based adventure game.

## 🎯 Server-Specific Focus Areas

The Leaf Server is a **WebSocket signaling server** focused on real-time communication. When contributing, keep in mind:

### **What We Focus On:**
- **Real-time Communication**: WebSocket event handling and message routing
- **Connection Management**: Socket lifecycle and user presence tracking
- **Performance**: Low-latency message delivery and efficient resource usage
- **Security**: Rate limiting, input validation, and abuse prevention
- **Reliability**: Graceful error handling and connection recovery

### **What We Don't Handle:**
- ❌ **Game Logic**: Handled by the client-side GameState
- ❌ **Data Persistence**: Handled by the Hive blockchain
- ❌ **User Authentication**: Handled by Hive Keychain
- ❌ **UI/UX**: Handled by the React client

## 📋 Table of Contents
1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Making Changes](#making-changes)
4. [Testing Strategy](#testing-strategy)
5. [Coding Standards](#coding-standards)
6. [WebSocket Development](#websocket-development)
7. [Performance Considerations](#performance-considerations)
8. [Security Guidelines](#security-guidelines)

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js 22.0+** (recommended: use NVM)
- **NPM 10.5.1+**
- **Git**
- **Socket.IO Client** (for testing WebSocket connections)

### Initial Setup

1. **Fork and Clone:**
   ```bash
   git clone git@gitlab.com:YOUR_USERNAME/leaf_server.git
   cd leaf_server
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start Development Server:**
   ```bash
   npm run dev
   ```

4. **Run Tests:**
   ```bash
   npm test
   ```

## 🔧 Development Environment

### Local Development

#### Development Server
```bash
# Start with auto-reload
npm run dev

# Start with file watching
npm run dev:watch

# Start production build
npm run build && npm start
```

#### Testing WebSocket Connections
```bash
# Install Socket.IO client for testing
npm install -g socket.io-client

# Test connection (in separate terminal)
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:4001');
socket.emit('register', { username: 'testuser' });
socket.on('connect', () => console.log('Connected!'));
"
```

### Environment Configuration

#### Development Environment
```bash
NODE_ENV=development
PORT=4001
# CORS: Allow all origins
# Rate Limiting: Disabled or permissive
```

#### Test Environment
```bash
NODE_ENV=test
PORT=4002
# CORS: Allow all origins
# Rate Limiting: Disabled
# Cleanup: Disabled for test stability
```

## 🔄 Making Changes

### Development Workflow

1. **Create Feature Branch:**
   ```bash
   git checkout -b feature/websocket-enhancement
   ```

2. **Make Changes:**
   - Focus on WebSocket event handling
   - Consider performance implications
   - Add appropriate logging
   - Update tests

3. **Test Your Changes:**
   ```bash
   # Run all tests
   npm test
   
   # Run with coverage
   npm run test:coverage
   
   # Test specific file
   npm test -- ChatService.test.ts
   ```

4. **Submit Changes:**
   - Push to your fork
   - Create merge request
   - Include clear description of WebSocket changes

### Commit Message Guidelines

Follow conventional commits with server-specific prefixes:
- `feat(websocket): new WebSocket event handler`
- `fix(connection): resolve socket disconnection issue`
- `perf(chat): optimize message broadcasting`
- `security(rate-limit): enhance rate limiting for chat messages`
- `test(websocket): add WebSocket event tests`
- `docs(api): update WebSocket API documentation`

## 🧪 Testing Strategy

### Test Categories

#### Unit Tests
- **Service Methods**: Test individual ChatService and UserService methods
- **Validation Logic**: Test input validation and sanitization
- **Utility Functions**: Test helper functions

```typescript
// Example: Testing ChatService method
describe('ChatService.joinChannel', () => {
  it('should add user to channel and broadcast join event', () => {
    const chatService = new ChatService(mockIO, mockLogger);
    const mockSocket = createMockSocket();
    
    chatService.joinChannel(mockSocket, { 
      channelId: 'test/channel', 
      username: 'testuser' 
    });
    
    expect(mockSocket.join).toHaveBeenCalledWith('test/channel');
    expect(mockIO.to).toHaveBeenCalledWith('test/channel');
  });
});
```

#### Integration Tests
- **WebSocket Events**: Test full event handling lifecycle
- **Service Interaction**: Test ChatService and UserService collaboration
- **Error Scenarios**: Test error handling and recovery

```typescript
// Example: Testing WebSocket event flow
describe('WebSocket Events', () => {
  it('should handle complete chat message flow', async () => {
    const client = io('http://localhost:4001');
    
    // Register user
    client.emit('register', { username: 'testuser' });
    
    // Join channel
    client.emit('joinChatChannel', { channelId: 'test/channel' });
    
    // Send message
    client.emit('chatMessage', { 
      channelId: 'test/channel', 
      message: 'Hello world!' 
    });
    
    // Verify message broadcast
    await expectMessage(client, 'chatMessage', {
      username: 'testuser',
      message: 'Hello world!',
      channelId: 'test/channel'
    });
  });
});
```

#### Performance Tests
- **Connection Load**: Test multiple concurrent connections
- **Message Throughput**: Test message broadcasting performance
- **Memory Usage**: Test memory consumption under load

### Test Environment Setup

#### Mock Strategy
```typescript
// Mock Socket.IO server
const mockIO = {
  sockets: {
    sockets: new Map(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn()
  }
};

// Mock Socket
const createMockSocket = () => ({
  id: 'test-socket-id',
  join: jest.fn(),
  leave: jest.fn(),
  emit: jest.fn(),
  rooms: new Set(['test/channel'])
});
```

## 📝 Coding Standards

### TypeScript Guidelines

#### Type Safety
- **Strict Mode**: All code must pass TypeScript strict mode
- **Interface Definitions**: Define interfaces for all data structures
- **Type Annotations**: Explicit types for function parameters and returns

```typescript
// Good: Explicit types
interface ChatMessageData {
  channelId: string;
  message: string;
  username: string;
}

function handleChatMessage(socket: Socket, data: ChatMessageData): void {
  // Implementation
}

// Avoid: Any types
function handleMessage(socket: any, data: any): any {
  // Implementation
}
```

#### Error Handling
- **Try-Catch Blocks**: Wrap async operations
- **Error Logging**: Log errors with context
- **Graceful Degradation**: Continue operation when possible

```typescript
// Good: Proper error handling
async function joinChannel(socket: Socket, data: JoinChatChannelData): Promise<void> {
  try {
    await validateChannelAccess(data.channelId, data.username);
    socket.join(data.channelId);
    broadcastPlayerJoined(data.channelId, data.username);
  } catch (error) {
    logger.error(`Failed to join channel: ${error.message}`, {
      channelId: data.channelId,
      username: data.username,
      socketId: socket.id
    });
    socket.emit('error', { message: 'Failed to join channel' });
  }
}
```

### WebSocket Development

#### Event Handling
- **Event Validation**: Validate all incoming event data
- **Rate Limiting**: Implement per-user rate limits
- **Error Responses**: Send clear error messages to clients

```typescript
// Good: Comprehensive event handling
socket.on('chatMessage', (data: ChatMessageData) => {
  // Validate input
  if (!isValidMessage(data)) {
    socket.emit('error', { message: 'Invalid message format' });
    return;
  }
  
  // Check rate limits
  if (isRateLimited(socket.id, 'chatMessage')) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  
  // Process message
  chatService.handleMessage(socket, data);
});
```

#### Connection Management
- **Lifecycle Events**: Handle connect, disconnect, and error events
- **Resource Cleanup**: Clean up user data on disconnect
- **Keepalive System**: Implement connection health monitoring

```typescript
// Good: Connection lifecycle management
socket.on('connect', () => {
  logger.info(`Socket connected: ${socket.id}`);
});

socket.on('disconnect', () => {
  const username = userService.getUsername(socket.id);
  if (username) {
    chatService.handleDisconnection(socket);
    userService.removeUser(socket.id);
    logger.info(`User ${username} disconnected`);
  }
});
```

## ⚡ Performance Considerations

### Optimization Guidelines

#### Message Broadcasting
- **Efficient Routing**: Use Socket.IO rooms for targeted broadcasting
- **Batch Operations**: Batch multiple operations when possible
- **Memory Management**: Clean up unused channels and connections

```typescript
// Good: Efficient broadcasting
function broadcastToChannel(channelId: string, event: string, data: any): void {
  // Use Socket.IO rooms for efficient broadcasting
  io.to(channelId).emit(event, data);
  
  // Update channel state
  updateChannelActivity(channelId);
}

// Avoid: Broadcasting to all sockets
function broadcastToAll(event: string, data: any): void {
  io.emit(event, data); // Inefficient for room-based communication
}
```

#### Connection Management
- **Connection Pooling**: Reuse connections when possible
- **Keepalive Optimization**: Efficient keepalive system
- **Memory Monitoring**: Monitor memory usage and clean up

```typescript
// Good: Memory-efficient connection tracking
class ConnectionManager {
  private connections = new Map<string, ConnectionInfo>();
  
  addConnection(socketId: string, username: string): void {
    this.connections.set(socketId, {
      username,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    });
  }
  
  removeConnection(socketId: string): void {
    this.connections.delete(socketId); // Clean up immediately
  }
}
```

## 🛡️ Security Guidelines

### Security Best Practices

#### Input Validation
- **Data Sanitization**: Sanitize all incoming data
- **Length Limits**: Enforce message length limits
- **Format Validation**: Validate data formats (usernames, channel IDs)

```typescript
// Good: Comprehensive input validation
function validateChatMessage(data: any): data is ChatMessageData {
  return (
    typeof data === 'object' &&
    typeof data.channelId === 'string' &&
    typeof data.message === 'string' &&
    data.message.length <= 500 &&
    isValidChannelId(data.channelId) &&
    !containsInjection(data.message)
  );
}
```

#### Rate Limiting
- **Per-User Limits**: Implement per-user rate limits
- **IP-Based Limits**: Additional IP-based rate limiting
- **Dynamic Limits**: Adjust limits based on user behavior

```typescript
// Good: Multi-level rate limiting
class RateLimiter {
  private userLimits = new Map<string, RateLimitInfo>();
  private ipLimits = new Map<string, RateLimitInfo>();
  
  isAllowed(socketId: string, ip: string, event: string): boolean {
    const userLimit = this.checkUserLimit(socketId, event);
    const ipLimit = this.checkIPLimit(ip, event);
    return userLimit && ipLimit;
  }
}
```

#### Error Handling
- **Information Disclosure**: Don't expose sensitive information in errors
- **Logging**: Log security events for monitoring
- **Graceful Degradation**: Continue operation when possible

```typescript
// Good: Secure error handling
function handleError(error: Error, socket: Socket): void {
  // Log error with context (but not sensitive data)
  logger.error('WebSocket error', {
    error: error.message,
    socketId: socket.id,
    timestamp: Date.now()
  });
  
  // Send generic error to client
  socket.emit('error', { 
    message: 'An error occurred' // Generic message
  });
}
```

## 📊 Monitoring & Debugging

### Logging Guidelines

#### Log Levels
- **DEBUG**: Detailed WebSocket events and routing
- **INFO**: User connections, channel operations
- **WARN**: Rate limit warnings, connection issues
- **ERROR**: System errors, security violations

#### Log Context
```typescript
// Good: Contextual logging
logger.info('User joined channel', {
  username: data.username,
  channelId: data.channelId,
  socketId: socket.id,
  timestamp: Date.now(),
  userCount: getChannelUserCount(data.channelId)
});
```

### Performance Monitoring

#### Key Metrics
- **Connection Count**: Active WebSocket connections
- **Message Rate**: Messages per second
- **Error Rate**: Failed operations per minute
- **Memory Usage**: Server memory consumption

#### Health Checks
```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    connections: io.engine.clientsCount,
    channels: chatService.getChannelCount(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

## 🔗 Integration Testing

### Client-Server Integration

#### Test Client Setup
```typescript
// Test client for integration testing
import { io } from 'socket.io-client';

const testClient = io('http://localhost:4001');

testClient.on('connect', () => {
  console.log('Test client connected');
});

testClient.on('chatMessage', (data) => {
  console.log('Received message:', data);
});
```

#### End-to-End Testing
```typescript
// Test complete message flow
describe('End-to-End Chat Flow', () => {
  it('should handle complete chat message lifecycle', async () => {
    const client1 = io('http://localhost:4001');
    const client2 = io('http://localhost:4001');
    
    // Setup clients
    await setupClients(client1, client2);
    
    // Send message
    client1.emit('chatMessage', {
      channelId: 'test/channel',
      message: 'Hello world!'
    });
    
    // Verify message received
    await expectMessage(client2, 'chatMessage', {
      username: 'user1',
      message: 'Hello world!'
    });
  });
});
```

## 📚 Resources

### Documentation
- **[Leaf Server README](README.md)** - Main server documentation
- **[WebSocket API Reference](README.md#websocket-api)** - Complete API documentation
- **[CI/CD Setup](CI_CD_README.md)** - Deployment configuration

### Related Projects
- **[Leaf Client](../leaf/README.md)** - Main game client
- **[Leaf Documentation](../leaf/DOCUMENTATION.md)** - Complete ecosystem documentation

### External Resources
- **[Socket.IO Documentation](https://socket.io/docs/)** - WebSocket framework docs
- **[Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)** - Node.js guidelines

## 🤝 Questions or Problems?

- **File an Issue**: Use GitLab issues for bugs and feature requests
- **Join Discussions**: Participate in community discussions
- **Contact Maintainers**: Reach out for complex questions

Thank you for contributing to Leaf Server! 🚀 