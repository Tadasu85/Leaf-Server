"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = exports.app = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// import config from './config'; // Not currently used
const ChatService_1 = __importDefault(require("./services/ChatService"));
const UserService_1 = __importDefault(require("./services/UserService"));
const Logger_1 = __importDefault(require("./utils/Logger"));
// Initialize logger
const logger = new Logger_1.default();
// Create Express app
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)({
    origin: process.env['NODE_ENV'] === 'production'
        ? ['https://leaf-game.herokuapp.com', 'https://leaf-game.netlify.app']
        : '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
// Create HTTP server
const server = (0, http_1.createServer)(app);
exports.server = server;
// Create Socket.IO server
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env['NODE_ENV'] === 'production'
            ? [
                'https://leaf-game.herokuapp.com',
                'https://leaf-game.netlify.app',
                'https://leaf-5lrq.onrender.com',
                process.env['REACT_APP_PRODUCTION_URL'] || 'https://leaf-5lrq.onrender.com'
            ]
            : '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 10000,
    connectTimeout: 20000,
    allowUpgrades: true,
    maxHttpBufferSize: 1e6,
    path: '/socket.io/'
});
exports.io = io;
// Initialize services
const chatService = new ChatService_1.default(io, logger);
const userService = new UserService_1.default(io, logger);
// Error handling
server.on('error', (error) => {
    logger.error('Server error:', error);
});
io.engine.on('connection_error', (err) => {
    logger.error('Connection error:', err);
});
// Socket connection handling
io.on('connection', (socket) => {
    const username = socket.handshake.query['username'];
    logger.info(`New socket connection: ${socket.id}, username: ${username}`);
    // Validate username is provided
    if (!username) {
        logger.warn('Connection attempt without username - disconnecting');
        socket.disconnect();
        return;
    }
    // Initialize user and register with username from query
    userService.handleConnection(socket);
    userService.registerUser(socket, username);
    // Handle user registration
    socket.on('register', (data) => {
        const { username: registerUsername } = data;
        if (registerUsername && registerUsername !== username) {
            // If username in register event differs from query username, update it
            userService.registerUser(socket, registerUsername);
            const response = { success: true };
            socket.emit('registered', response);
        }
        else {
            const response = { success: true };
            socket.emit('registered', response);
        }
    });
    // Chat events
    socket.on('joinChatChannel', (data) => {
        logger.info(`[Server] Received joinChatChannel event from socket ${socket.id}: ${JSON.stringify(data)}`);
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to join chat channel without username');
            return;
        }
        logger.info(`[Server] Calling chatService.joinChannel for user ${username}`);
        chatService.joinChannel(socket, { ...data, username });
    });
    socket.on('leaveChatChannel', (data) => {
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to leave chat channel without username');
            return;
        }
        chatService.leaveChannel(socket, { ...data, username });
    });
    socket.on('chatMessage', (data) => {
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to send chat message without username');
            return;
        }
        chatService.handleMessage(socket, { ...data, username });
    });
    socket.on('emote', (data) => {
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to send emote without username');
            return;
        }
        if (!data.channelId || !data.emote) {
            socket.emit('error', { message: 'Missing channelId or emote' });
            return;
        }
        chatService.handleEmote(socket, { channelId: data.channelId, emote: data.emote, username });
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        userService.handleDisconnection(socket);
        chatService.handleDisconnection(socket);
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});
// Health check endpoint
app.get('/health', (_req, res) => {
    const response = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            chat: chatService.getStatus(),
            users: userService.getStatus()
        }
    };
    res.json(response);
});
// Basic HTTP GET route for the root path
app.get('/', (_req, res) => {
    res.sendStatus(200); // Respond with a 200 OK status for health checks
});
// Start server
const PORT = process.env['PORT'] ? parseInt(process.env['PORT']) : 4001;
// Only start the server if not in test environment
if (process.env['NODE_ENV'] !== 'test') {
    server.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
        logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
    });
}
//# sourceMappingURL=server.js.map