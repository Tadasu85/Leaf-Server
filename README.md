# Leaf Server

A WebSocket server component that provides real-time communication and state management for text-based adventure games. The server handles room state synchronization, player presence tracking, and real-time messaging between players.

## Features

- WebSocket-based real-time communication
- Room state management and synchronization
- Player presence tracking
- Chat and emote broadcasting
- Builder queue management
- P2P signaling for direct player connections
- Automatic room cleanup
- Connection state management

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

4. Start the server
   ```bash
   npm start
   ```

## Configuration

The server uses the following hardcoded configuration:

```javascript
// Server Configuration
const PORT = process.env.PORT || 4001;

// WebSocket Configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket'], // Only use WebSocket
  pingTimeout: 30000,        // 30 seconds
  pingInterval: 15000,       // 15 seconds
  connectTimeout: 20000,     // 20 seconds
  maxHttpBufferSize: 1e6     // 1MB
});
```

## API Documentation

### WebSocket Events

#### Client to Server

- `register`: Register a new user
  ```javascript
  {
    username: string
  }
  ```

- `joinRoom`: Join a game room
  ```javascript
  {
    room: string,
    username: string,
    roomData: object
  }
  ```

- `leaveRoom`: Leave a game room
  ```javascript
  {
    username: string,
    room: string
  }
  ```

- `chat`: Send a chat message
  ```javascript
  {
    room: string,
    message: string,
    username: string
  }
  ```

- `emote`: Send an emote
  ```javascript
  {
    room: string,
    emote: string,
    username: string
  }
  ```

- `signal`: WebRTC signaling
  ```javascript
  {
    from: string,
    to: string,
    signal: object
  }
  ```

#### Server to Client

- `roomState`: Current room state
  ```javascript
  {
    room: string,
    players: string[]
  }
  ```

- `roomJoined`: Room join confirmation
  ```javascript
  {
    room: string,
    players: string[]
  }
  ```

- `playerJoined`: New player notification
  ```javascript
  {
    room: string,
    username: string,
    players: string[]
  }
  ```

- `chat`: Chat message broadcast
  ```javascript
  {
    username: string,
    message: string,
    room: string
  }
  ```

- `emote`: Emote broadcast
  ```javascript
  {
    username: string,
    emote: string
  }
  ```

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Code Style
- Follow ESLint configuration
- Use TypeScript for new code
- Follow the established project structure

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and development process.

## License

This project is licensed under the Creative Commons Attribution 4.0 International License - see the [LICENSE](LICENSE) file for details. 