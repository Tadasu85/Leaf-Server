"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = exports.app = exports.cleanup = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// import config from './config'; // Not currently used
const ChatService_1 = __importDefault(require("./services/ChatService"));
const UserService_1 = __importDefault(require("./services/UserService"));
const Logger_1 = __importDefault(require("./utils/Logger"));
// Initialize logger
const logger = new Logger_1.default();
// Rate limiting configuration
const createRateLimiter = (windowMs, limit, message) => {
    return (0, express_rate_limit_1.default)({
        windowMs,
        limit,
        message: { error: message },
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
            res.status(429).json({ error: message });
        }
    });
};
// General API rate limiting (15 minutes, 100 requests)
const apiLimiter = createRateLimiter(15 * 60 * 1000, // 15 minutes
100, // 100 requests per window
'Too many requests from this IP');
// Stricter rate limiting for socket connections (1 minute, 10 connections)
const socketLimiter = createRateLimiter(1 * 60 * 1000, // 1 minute
10, // 10 socket connections per minute per IP
'Too many socket connections from this IP');
// Create Express app
const app = (0, express_1.default)();
exports.app = app;
// Apply rate limiting to all routes (skip in test environment)
if (process.env['NODE_ENV'] !== 'test') {
    app.use(apiLimiter);
    app.use('/socket.io/', socketLimiter);
}
app.use((0, cors_1.default)({
    origin: process.env['NODE_ENV'] === 'production'
        ? [process.env['REACT_APP_PRODUCTION_URL'] || 'https://leaf-5lrq.onrender.com']
        : '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
// Create HTTP server
const server = (0, http_1.createServer)(app);
exports.server = server;
// Socket.IO rate limiting storage
const socketRateLimits = new Map();
// Create Socket.IO server
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env['NODE_ENV'] === 'production'
            ? [
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
// Cleanup function for tests
const cleanup = () => {
    chatService.cleanup();
    // Add any other cleanup needed for UserService if it has intervals
};
exports.cleanup = cleanup;
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
    const userIP = socket.handshake.address;
    logger.info(`New socket connection: ${socket.id}, username: ${username}, IP: ${userIP}`);
    // Validate username is provided
    if (!username) {
        logger.warn('Connection attempt without username - disconnecting');
        socket.disconnect();
        return;
    }
    // Initialize rate limiting for this user (skip in test environment)
    let userLimit;
    if (process.env['NODE_ENV'] !== 'test') {
        if (!socketRateLimits.has(userIP)) {
            socketRateLimits.set(userIP, {
                messageCount: 0,
                lastReset: Date.now(),
                connections: 0,
                joinLeaveCount: 0,
                lastJoinLeaveReset: Date.now()
            });
        }
        userLimit = socketRateLimits.get(userIP);
        userLimit.connections++;
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
    // Chat events with rate limiting
    socket.on('joinChatChannel', (data) => {
        // Rate limit join/leave operations (skip in test environment)
        if (process.env['NODE_ENV'] !== 'test' && userLimit) {
            const now = Date.now();
            if (now - userLimit.lastJoinLeaveReset > 60000) { // 1 minute
                userLimit.joinLeaveCount = 0;
                userLimit.lastJoinLeaveReset = now;
            }
            if (userLimit.joinLeaveCount > 20) { // max 20 join/leave operations per minute
                logger.warn(`Rate limit exceeded for join/leave operations: ${socket.handshake.query['username']} (${userIP})`);
                socket.emit('error', { message: 'Too many room changes. Please wait a moment.' });
                return;
            }
            userLimit.joinLeaveCount++;
        }
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
        // Rate limit join/leave operations (skip in test environment)
        if (process.env['NODE_ENV'] !== 'test' && userLimit) {
            const now = Date.now();
            if (now - userLimit.lastJoinLeaveReset > 60000) { // 1 minute
                userLimit.joinLeaveCount = 0;
                userLimit.lastJoinLeaveReset = now;
            }
            if (userLimit.joinLeaveCount > 20) { // max 20 join/leave operations per minute
                logger.warn(`Rate limit exceeded for join/leave operations: ${socket.handshake.query['username']} (${userIP})`);
                socket.emit('error', { message: 'Too many room changes. Please wait a moment.' });
                return;
            }
            userLimit.joinLeaveCount++;
        }
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to leave chat channel without username');
            return;
        }
        chatService.leaveChannel(socket, { ...data, username });
    });
    socket.on('chatMessage', (data) => {
        // Rate limit chat messages (skip in test environment)
        if (process.env['NODE_ENV'] !== 'test' && userLimit) {
            const now = Date.now();
            if (now - userLimit.lastReset > 60000) { // 1 minute
                userLimit.messageCount = 0;
                userLimit.lastReset = now;
            }
            if (userLimit.messageCount > 30) { // max 30 messages per minute
                logger.warn(`Rate limit exceeded for chat messages: ${socket.handshake.query['username']} (${userIP})`);
                socket.emit('error', { message: 'Too many messages. Please wait a moment.' });
                return;
            }
            userLimit.messageCount++;
        }
        const username = userService.getUserBySocket(socket.id);
        if (!username) {
            logger.warn('Attempted to send chat message without username');
            return;
        }
        chatService.handleMessage(socket, { ...data, username });
    });
    socket.on('emote', (data) => {
        // Rate limit emotes (skip in test environment)
        if (process.env['NODE_ENV'] !== 'test' && userLimit) {
            const now = Date.now();
            if (now - userLimit.lastReset > 60000) { // 1 minute
                userLimit.messageCount = 0;
                userLimit.lastReset = now;
            }
            if (userLimit.messageCount > 30) { // max 30 emotes per minute
                logger.warn(`Rate limit exceeded for emotes: ${socket.handshake.query['username']} (${userIP})`);
                socket.emit('error', { message: 'Too many emotes. Please wait a moment.' });
                return;
            }
            userLimit.messageCount++;
        }
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
    // Handle keepalive response
    socket.on('keepaliveResponse', () => {
        chatService.handleKeepaliveResponse(socket);
    });
    // Handle disconnection
    socket.on('disconnect', () => {
        // Clean up rate limiting data (skip in test environment)
        if (process.env['NODE_ENV'] !== 'test' && userLimit) {
            userLimit.connections--;
            if (userLimit.connections <= 0) {
                socketRateLimits.delete(userIP);
            }
        }
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
        logger.info('Rate limiting enabled:');
        logger.info('- API: 100 requests per 15 minutes');
        logger.info('- Socket connections: 10 per minute');
        logger.info('- Chat messages: 30 per minute');
        logger.info('- Room changes: 20 per minute');
    });
}
//# sourceMappingURL=server.js.map