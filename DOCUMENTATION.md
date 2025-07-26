# Leaf Server Documentation Index

Welcome to the Leaf Server documentation! This index provides a comprehensive overview of the WebSocket signaling server that powers real-time communication for the Leaf text-based adventure game framework.

## 🎯 Server Overview

The Leaf Server is a **WebSocket signaling server** that provides real-time communication infrastructure for the Leaf game. It handles ephemeral, real-time aspects while the Hive blockchain serves as the primary source of truth for persistent game state.

### **Key Distinctions:**
- **Server Role**: Real-time communication only
- **Client Role**: Game logic, blockchain integration, UI
- **Blockchain Role**: Persistent game state and data storage

## 📖 Documentation Structure

### **Getting Started**
- **[README.md](README.md)** - Main server overview, quick start, and API documentation
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines and contribution process
- **[CI_CD_README.md](CI_CD_README.md)** - Deployment and CI/CD pipeline configuration

### **Architecture & Design**
- **WebSocket API** - Real-time communication protocol
- **Service Architecture** - ChatService and UserService design
- **Security Model** - Rate limiting, validation, and error handling
- **State Management** - Ephemeral in-memory state only

## 🏗️ Server Architecture

### **Core Services**

#### ChatService
- **Purpose**: Manages room-based chat channels and real-time messaging
- **Responsibilities**:
  - Channel creation and management
  - Message broadcasting to room participants
  - Player presence tracking
  - Keepalive system for connection health
  - Automatic cleanup of stale connections

#### UserService
- **Purpose**: Handles user registration and connection management
- **Responsibilities**:
  - User registration for chat functionality
  - Socket ID to username mapping
  - Connection state tracking
  - Graceful disconnection handling

### **Data Flow Architecture**

```
Client Connection → User Registration → Channel Management → Real-time Communication
       ↓                    ↓                    ↓                    ↓
   Socket.IO           UserService          ChatService         Message Broadcasting
       ↓                    ↓                    ↓                    ↓
   Connection          Username Map         Channel State        Room Participants
```

### **State Management Strategy**

- **Ephemeral State**: All data stored in-memory
- **No Persistence**: Server restarts clear all state
- **Real-time Focus**: Optimized for low-latency communication
- **Automatic Cleanup**: Stale connections and channels cleaned up automatically

## 📡 WebSocket API Reference

### **Connection Events**

#### Client → Server Events
| Event | Purpose | Payload | Rate Limit |
|-------|---------|---------|------------|
| `register` | Register user for chat | `{ username: string }` | 10/min |
| `joinChatChannel` | Join room chat | `{ channelId: string }` | 30/min |
| `leaveChatChannel` | Leave room chat | `{ channelId: string, username: string }` | 30/min |
| `chatMessage` | Send message | `{ channelId: string, message: string }` | 60/min |
| `emote` | Send emote | `{ channelId: string, emote: string }` | 60/min |
| `keepalive` | Respond to keepalive | `{ timestamp: number }` | No limit |

#### Server → Client Events
| Event | Purpose | Payload |
|-------|---------|---------|
| `chatChannelState` | Current channel state | `{ channelId: string, players: string[], lastUpdated: number }` |
| `playerJoined` | Player joined notification | `{ username: string, players: string[], channelId: string }` |
| `playerLeft` | Player left notification | `{ username: string, players: string[], channelId: string }` |
| `chatMessage` | Message broadcast | `{ username: string, message: string, timestamp: number, channelId: string }` |
| `emote` | Emote broadcast | `{ username: string, emote: string, timestamp: number, channelId: string }` |
| `userStatus` | User status update | `{ username: string, isOnline: boolean, timestamp: number }` |
| `keepalive` | Keepalive request | `{ timestamp: number }` |

### **Channel Management**

#### Channel Lifecycle
1. **Creation**: Channel created when first player joins
2. **Active**: Players can send/receive messages
3. **Cleanup**: Channel removed when last player leaves
4. **Keepalive**: Periodic health checks for active channels

#### Channel State
```typescript
interface ChatChannel {
  channelId: string;
  players: Set<string>;
  lastActivity: number;
  messageCount: number;
}
```

## 🛡️ Security & Performance

### **Rate Limiting Strategy**

#### Connection Rate Limiting
- **Socket Connections**: 10 connections per minute per IP
- **User Registration**: 10 registrations per minute per IP
- **Channel Operations**: 30 join/leave operations per minute per user

#### Message Rate Limiting
- **Chat Messages**: 60 messages per minute per user
- **Emotes**: 60 emotes per minute per user
- **Keepalive Responses**: No limit (required for connection health)

### **Input Validation**

#### Message Validation
- **Length Limits**: Messages ≤ 500 characters
- **Content Filtering**: Basic injection prevention
- **Channel Validation**: Ensure user is in channel before sending

#### Connection Validation
- **Username Format**: Valid Hive username format
- **Channel ID Format**: Valid author/permlink format
- **Socket Authentication**: Verify user registration before operations

### **Error Handling**

#### Graceful Degradation
- **Connection Failures**: Individual failures don't affect other users
- **Invalid Messages**: Rejected with error response
- **Rate Limit Exceeded**: Clear error message with retry guidance

#### Logging Strategy
- **Structured Logging**: JSON format for easy parsing
- **Context Information**: Username, channel, socket ID in all logs
- **Error Tracking**: Comprehensive error logging for debugging

## 🔍 Monitoring & Operations

### **Health Monitoring**

#### Health Check Endpoint
```bash
GET /health
Response: {
  status: "healthy",
  timestamp: "2024-01-01T00:00:00.000Z",
  uptime: 3600,
  connections: 150,
  channels: 25
}
```

#### Key Metrics
- **Active Connections**: Number of connected users
- **Active Channels**: Number of chat channels
- **Message Rate**: Messages per second
- **Error Rate**: Failed operations per minute
- **Memory Usage**: Server memory consumption

### **Logging Levels**

#### DEBUG
- Socket connection/disconnection events
- Channel join/leave operations
- Message routing details
- Keepalive system activity

#### INFO
- User registration events
- Channel creation/deletion
- Rate limit warnings
- Periodic cleanup operations

#### WARN
- Rate limit exceeded
- Invalid message attempts
- Connection timeouts
- Resource usage warnings

#### ERROR
- Socket.IO errors
- Service failures
- Memory issues
- Critical system errors

## 🧪 Testing Strategy

### **Test Categories**

#### Unit Tests
- **Service Methods**: Individual ChatService and UserService methods
- **Validation Logic**: Input validation and sanitization
- **Utility Functions**: Helper functions and utilities

#### Integration Tests
- **WebSocket Events**: Full event handling lifecycle
- **Service Interaction**: ChatService and UserService collaboration
- **Error Scenarios**: Error handling and recovery

#### End-to-End Tests
- **Connection Lifecycle**: Full user connection to disconnection
- **Message Flow**: Complete message sending and receiving
- **Channel Management**: Channel creation, usage, and cleanup

### **Test Environment**

#### Mock Strategy
- **Socket.IO Mocking**: Simulate client connections
- **Time Mocking**: Control keepalive timing
- **Memory Mocking**: Test cleanup scenarios

#### Test Data
- **Sample Users**: Test usernames and connection patterns
- **Sample Channels**: Test channel IDs and room scenarios
- **Sample Messages**: Test message content and formatting

## 🚀 Deployment & Operations

### **Environment Configuration**

#### Development
```bash
NODE_ENV=development
PORT=4001
# CORS: Allow all origins
# Rate Limiting: Disabled or very permissive
```

#### Production
```bash
NODE_ENV=production
PORT=4001
REACT_APP_PRODUCTION_URL=https://your-client-domain.com
# CORS: Restricted to client domains
# Rate Limiting: Strict limits enabled
```

### **Deployment Options**

#### Traditional Deployment
1. **Build**: `npm run build`
2. **Start**: `npm start`
3. **Process Management**: PM2 or systemd
4. **Load Balancing**: Multiple instances behind load balancer

#### Container Deployment
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4001
CMD ["npm", "start"]
```

#### Cloud Deployment
- **Render**: Automatic deployments from GitLab
- **Heroku**: Container-based deployment
- **AWS**: ECS or EC2 deployment
- **Google Cloud**: Cloud Run or GKE

### **CI/CD Pipeline**

#### Pipeline Stages
1. **Lint**: TypeScript compilation check
2. **Test**: Unit and integration tests
3. **Security**: npm audit for vulnerabilities
4. **Build**: TypeScript compilation
5. **Deploy**: Staging and production deployment

#### Deployment Strategy
- **Staging**: Automatic deployment on main branch
- **Production**: Manual deployment on tags
- **Rollback**: Quick rollback to previous version
- **Monitoring**: Health checks and error tracking

## 🔗 Integration with Leaf Ecosystem

### **Client Integration**

#### Connection Setup
```typescript
// Client-side connection to Leaf Server
import { io } from 'socket.io-client';

const socket = io('https://leaf-server-5lrq.onrender.com');

// Register for chat functionality
socket.emit('register', { username: 'player1' });

// Join room chat when entering room
socket.emit('joinChatChannel', { channelId: 'author/room-permlink' });
```

#### Event Handling
```typescript
// Listen for real-time updates
socket.on('chatMessage', (data) => {
  // Update UI with new message
  displayMessage(data.username, data.message);
});

socket.on('playerJoined', (data) => {
  // Update player list
  updatePlayerList(data.players);
});
```

### **Blockchain Integration**

#### Separation of Concerns
- **Server**: Real-time communication only
- **Blockchain**: Persistent game state
- **Client**: Orchestrates both systems

#### Data Flow
1. **Game State**: Stored on Hive blockchain
2. **Real-time Updates**: Handled by Leaf Server
3. **Client Synchronization**: Combines both sources

## 📚 Related Documentation

### **Leaf Client Documentation**
- **[Leaf Client README](../leaf/README.md)** - Main game client documentation
- **[Leaf Documentation Index](../leaf/DOCUMENTATION.md)** - Complete client documentation overview
- **[Game Architecture](../leaf/README.md#technical-architecture)** - How client integrates with server

### **Development Resources**
- **[Contributing Guide](CONTRIBUTING.md)** - Development guidelines
- **[CI/CD Setup](CI_CD_README.md)** - Deployment configuration
- **[API Reference](README.md#websocket-api)** - Complete WebSocket API documentation

## 🤝 Contributing

### **Getting Started**
1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines
2. Set up development environment
3. Run tests to ensure everything works
4. Create feature branch and make changes
5. Submit merge request with clear description

### **Development Focus Areas**
- **Performance**: Optimize message routing and connection handling
- **Security**: Enhance rate limiting and input validation
- **Monitoring**: Improve logging and metrics collection
- **Testing**: Expand test coverage and scenarios

---

*This documentation is maintained by the Leaf development team. For questions or suggestions, please file an issue in the GitLab repository.* 