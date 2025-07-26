# Leaf Server - WebSocket Signaling Server

A TypeScript-based WebSocket signaling server that provides **real-time communication infrastructure** for the Leaf text-based adventure game framework. This server handles the ephemeral, real-time aspects of the game while the Hive blockchain serves as the primary source of truth for persistent game state.

## 🎯 Purpose & Architecture

### **What This Server Does:**
- **Real-time Communication**: WebSocket-based messaging between players
- **Chat Management**: Room-based chat channels and emotes
- **Player Presence**: Track who is currently online and in which rooms
- **Connection Management**: Handle player connections, disconnections, and keepalive
- **Rate Limiting**: Prevent abuse and ensure fair usage

### **What This Server Does NOT Do:**
- ❌ **Game State Management** (handled by Hive blockchain)
- ❌ **Room Data Storage** (stored on-chain as Hive posts)
- ❌ **Player Authentication** (handled by Hive Keychain)
- ❌ **Game Logic** (handled by client-side GameState)

### **Architecture Overview:**
```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Leaf Client   │ ◄─────────────► │  Leaf Server    │
│   (React App)   │   Real-time     │  (Signaling)    │
└─────────────────┘   Communication └─────────────────┘
         │                                    │
         │                                    │
         ▼                                    ▼
┌─────────────────┐                ┌─────────────────┐
│  Hive Blockchain│                │  Connection     │
│  (Game State)   │                │  Management     │
└─────────────────┘                └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 22.0+ (recommended: use NVM)
- NPM 10.5.1+
- Git

### Installation & Setup

1. **Clone and Install:**
   ```bash
   git clone https://gitlab.com/Tadasu85/leaf_server.git
   cd leaf_server
   npm install
   ```

2. **Start Development Server:**
   ```bash
   npm run dev
   ```

3. **Start Production Server:**
   ```bash
   npm run build
   npm start
   ```

4. **Run Tests:**
   ```bash
   npm test
   ```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=4001                          # Server port (default: 4001)
NODE_ENV=development               # Environment (development/production/test)

# CORS Configuration (Production)
REACT_APP_PRODUCTION_URL=https://your-client-domain.com

# Rate Limiting (Optional)
RATE_LIMIT_WINDOW_MS=900000        # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100        # 100 requests per window
SOCKET_RATE_LIMIT_WINDOW_MS=60000  # 1 minute
SOCKET_RATE_LIMIT_MAX_CONNECTIONS=10
```

### WebSocket Configuration

```typescript
// Default Socket.IO Configuration
{
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,        // 30 seconds
  pingInterval: 10000,       // 10 seconds
  connectTimeout: 20000,     // 20 seconds
  allowUpgrades: true,
  maxHttpBufferSize: 1e6     // 1MB
}
```

## 📡 WebSocket API

### Connection Events

#### Client → Server

| Event | Purpose | Payload |
|-------|---------|---------|
| `register` | Register user for chat | `{ username: string }` |
| `joinChatChannel` | Join a room's chat | `{ channelId: string }` |
| `leaveChatChannel` | Leave a room's chat | `{ channelId: string, username: string }` |
| `chatMessage` | Send chat message | `{ channelId: string, message: string }` |
| `emote` | Send emote | `{ channelId: string, emote: string }` |
| `keepalive` | Respond to keepalive | `{ timestamp: number }` |

#### Server → Client

| Event | Purpose | Payload |
|-------|---------|---------|
| `chatChannelState` | Current channel state | `{ channelId: string, players: string[], lastUpdated: number }` |
| `playerJoined` | Player joined notification | `{ username: string, players: string[], channelId: string }` |
| `playerLeft` | Player left notification | `{ username: string, players: string[], channelId: string }` |
| `chatMessage` | Chat message broadcast | `{ username: string, message: string, timestamp: number, channelId: string }` |
| `emote` | Emote broadcast | `{ username: string, emote: string, timestamp: number, channelId: string }` |
| `userStatus` | User online/offline | `{ username: string, isOnline: boolean, timestamp: number }` |
| `keepalive` | Keepalive request | `{ timestamp: number }` |

### Example Usage

```typescript
// Client-side connection
import { io } from 'socket.io-client';

const socket = io('http://localhost:4001');

// Register user
socket.emit('register', { username: 'player1' });

// Join room chat
socket.emit('joinChatChannel', { channelId: 'author/room-permlink' });

// Send message
socket.emit('chatMessage', { 
  channelId: 'author/room-permlink', 
  message: 'Hello everyone!' 
});

// Listen for messages
socket.on('chatMessage', (data) => {
  console.log(`${data.username}: ${data.message}`);
});
```

## 🛡️ Security & Performance

### Rate Limiting
- **API Rate Limiting**: 100 requests per 15 minutes per IP
- **Socket Rate Limiting**: 10 connections per minute per IP
- **Message Rate Limiting**: Per-user limits to prevent spam

### Connection Management
- **Keepalive System**: Automatic cleanup of stale connections
- **Graceful Disconnection**: Proper cleanup when players disconnect
- **Channel Cleanup**: Automatic removal from channels on disconnect

### Error Handling
- **Validation**: All incoming data is validated
- **Logging**: Comprehensive logging for debugging
- **Graceful Degradation**: Server continues operating even if individual connections fail

## 🏗️ Architecture Details

### Services

#### ChatService
- **Channel Management**: Create, join, leave chat channels
- **Message Broadcasting**: Distribute messages to all players in a room
- **Player Tracking**: Track who is in each channel
- **Keepalive Management**: Detect and clean up stale connections

#### UserService
- **User Registration**: Register users for chat functionality
- **Connection Tracking**: Map socket IDs to usernames
- **Status Management**: Track online/offline status

### Data Flow

1. **Player Connects**: Socket connection established
2. **User Registration**: Player registers with username
3. **Room Entry**: Player joins room's chat channel
4. **Real-time Communication**: Messages and emotes broadcast to all players in room
5. **Room Exit**: Player leaves chat channel
6. **Disconnection**: Cleanup of user data and channel membership

### State Management

- **Ephemeral State**: All data is in-memory and lost on restart
- **No Persistence**: Server doesn't store any persistent data
- **Real-time Only**: Focused solely on real-time communication

## 🔍 Monitoring & Debugging

### Health Check Endpoint
```bash
GET /health
Response: { status: "healthy", timestamp: "2024-01-01T00:00:00.000Z" }
```

### Logging
- **Structured Logging**: JSON format for easy parsing
- **Log Levels**: DEBUG, INFO, WARN, ERROR
- **Context Information**: Username, channel, socket ID in logs

### Metrics
- **Connection Count**: Number of active connections
- **Channel Count**: Number of active chat channels
- **Message Rate**: Messages per second
- **Error Rate**: Failed operations per minute

## 🧪 Testing

### Running Tests
```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure
- **Unit Tests**: Individual service methods
- **Integration Tests**: WebSocket event handling
- **End-to-End Tests**: Full connection lifecycle

## 🚀 Deployment

### Production Deployment
1. **Build**: `npm run build`
2. **Start**: `npm start`
3. **Environment**: Set `NODE_ENV=production`
4. **CORS**: Configure allowed origins

### Docker Deployment
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4001
CMD ["npm", "start"]
```

### CI/CD Pipeline
- **Automated Testing**: All tests must pass
- **Security Scanning**: npm audit for vulnerabilities
- **Deployment**: Staging and production environments
- **Monitoring**: Health checks and error tracking

## 📚 Related Documentation

- **[Leaf Client README](../leaf/README.md)** - Main game client documentation
- **[Leaf Documentation Index](../leaf/DOCUMENTATION.md)** - Complete documentation overview
- **[CI/CD Setup](CI_CD_README.md)** - Deployment and pipeline configuration
- **[Contributing Guide](CONTRIBUTING.md)** - Development guidelines

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our development process and coding standards.

## 📄 License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details.
