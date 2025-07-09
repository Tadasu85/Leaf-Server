# Leaf Server

A TypeScript-based WebSocket signaling server that provides real-time communication for the Leaf game. The server handles chat channel management, user presence tracking, and real-time messaging between players.

## Features

- TypeScript-based codebase with full type safety
- WebSocket-based real-time communication
- Chat channel management and synchronization
- User presence tracking and status broadcasting
- Chat and emote broadcasting
- Automatic channel cleanup
- Connection state management
- Health check endpoints

## Prerequisites

- Node.js 22.0+ (recommended to use NVM)
- NPM 10.5.1+
- Git

## Installation

1. Install Node.js and npm (recommended: use NVM)
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 22
   nvm use 22
   ```

2. Clone the repository
   ```bash
   git clone https://gitlab.com/Tadasu85/leaf_server.git
   cd leaf_server
   ```

3. Install dependencies
   ```bash
   npm install
   ```

4. Build and start the server
   ```bash
   npm run build
   npm start
   ```

## Configuration

The server uses TypeScript configuration and environment variables:

```typescript
// Server Configuration
const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 4001;

// WebSocket Configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env['NODE_ENV'] === 'production' 
      ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 10000,
  connectTimeout: 20000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e6
});
```

## API Documentation

### WebSocket Events

#### Client to Server

- `register`: Register a new user
  ```typescript
  {
    username: string
  }
  ```

- `joinChatChannel`: Join a chat channel
  ```typescript
  {
    channelId: string
  }
  ```

- `leaveChatChannel`: Leave a chat channel
  ```typescript
  {
    channelId: string,
    username: string
  }
  ```

- `chatMessage`: Send a chat message
  ```typescript
  {
    channelId: string,
    message: string
  }
  ```

- `emote`: Send an emote
  ```typescript
  {
    channelId: string,
    emote: string
  }
  ```

#### Server to Client

- `chatChannelState`: Current channel state
  ```typescript
  {
    channelId: string,
    players: string[],
    lastUpdated: number
  }
  ```

- `playerJoined`: New player notification
  ```typescript
  {
    username: string,
    players: string[],
    channelId: string
  }
  ```

- `playerLeft`: Player left notification
  ```typescript
  {
    username: string,
    players: string[],
    channelId: string
  }
  ```

- `chatMessage`: Chat message broadcast
  ```typescript
  {
    username: string,
    message: string,
    timestamp: number,
    channelId: string
  }
  ```

- `emote`: Emote broadcast
  ```typescript
  {
    username: string,
    emote: string,
    timestamp: number,
    channelId: string
  }
  ```

- `userStatus`: User online/offline status
  ```typescript
  {
    username: string,
    isOnline: boolean,
    timestamp: number
  }
  ```

## Development

### Running Tests
```bash
npm test
```

### Development Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Start development server with auto-rebuild
npm run dev

# Watch TypeScript files for changes
npm run dev:watch

# Clean build artifacts
npm run clean
```

### Code Style
- Follow TypeScript strict mode configuration
- Use proper type annotations
- Follow the established project structure
- All new code must be written in TypeScript

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and development process.

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details. # Test commit
