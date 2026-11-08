import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
// import config from './config'; // Not currently used
import ChatService from './services/ChatService';
import UserService from './services/UserService';
import CurationService from './services/CurationService';
import RoomRegistry from './services/RoomRegistry';
import { getClientIP } from './utils/clientIP';
import ChainVisitService from './services/ChainVisitService';
import { BlockRangeMoveSource } from './services/MoveSource';
import BuilderService from './services/BuilderService';
import MuteService from './services/MuteService';
import CommunityBanService from './services/CommunityBanService';
import AuthService, { parseAuthMode, AuthPayload, isGuestName } from './services/AuthService';
import config from './config';
import Logger from './utils/Logger';
import { 
  RegisterData, 
  RegisterResponse, 
  JoinChatChannelData, 
  LeaveChatChannelData, 
  ChatMessageData, 
  EmoteData,
  HealthCheckResponse 
} from './types';

// Initialize logger
const logger = new Logger();

// Rate limiting configuration
const createRateLimiter = (windowMs: number, limit: number, message: string) => {
  return rateLimit({
    windowMs,
    limit,
    message: { error: message },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ error: message });
    }
  });
};

// General API rate limiting (15 minutes, 100 requests)
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP'
);

// Stricter rate limiting for socket connections (1 minute, 10 connections)
const socketLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  10, // 10 socket connections per minute per IP
  'Too many socket connections from this IP'
);

// Guest identities: 10 per hour per IP
const guestLimiter = createRateLimiter(
  60 * 60 * 1000,
  10,
  'Too many guest accounts from this IP'
);

// Guests may send at most this many chat messages and emotes per minute.
const GUEST_MESSAGES_PER_MINUTE = 8;
const guestMessageAllowed = (socket: { data: Record<string, any> }): boolean => {
  if (!socket.data['guest']) return true;
  const now = Date.now();
  const window = socket.data['guestWindow'] as { start: number; count: number } | undefined;
  if (!window || now - window.start > 60000) {
    socket.data['guestWindow'] = { start: now, count: 1 };
    return true;
  }
  window.count++;
  return window.count <= GUEST_MESSAGES_PER_MINUTE;
};

// Create Express app
const app = express();

// Render (and most cloud platforms) sit behind a reverse proxy that sets X-Forwarded-For.
// Without this, express-rate-limit throws a ValidationError on every request.
app.set('trust proxy', 1);

// Apply rate limiting to all routes (skip in test environment)
if (process.env['NODE_ENV'] !== 'test') {
  app.use(apiLimiter);
  app.use('/socket.io/', socketLimiter);
}

app.use(cors({
  origin: process.env['NODE_ENV'] === 'production'
    ? [process.env['REACT_APP_PRODUCTION_URL'] || 'https://leaf-5lrq.onrender.com']
    : '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

// Create HTTP server
const server = createServer(app);

// Socket.IO rate limiting storage
const socketRateLimits = new Map<string, {
  messageCount: number;
  lastReset: number;
  connections: number;
  joinLeaveCount: number;
  lastJoinLeaveReset: number;
  emoteCount: number;
  lastEmoteReset: number;
}>();

// Create Socket.IO server
const io = new SocketIOServer(server, {
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

// Initialize services
const postingKey = process.env['HIVE_POSTING_KEY'] || null;
const roomRegistry = new RoomRegistry(logger, config.game.account, config.hive.nodes[0]);
if (process.env['NODE_ENV'] !== 'test') {
  roomRegistry.refresh().catch(() => undefined);
}
const curationService = new CurationService(logger, config.game.account, postingKey, roomRegistry);
const builderService = new BuilderService(logger, config.game.account, config.game.idName, postingKey);
const muteService = new MuteService(logger, config.hive.nodes[0]);
const chatService = new ChatService(io, logger, curationService, muteService);
const userService = new UserService(io, logger);
// Players muted in the game's Hive community are banned from chat game-wide.
const communityBans = new CommunityBanService(
  logger,
  process.env['GAME_COMMUNITY'] || config.game.account,
  config.hive.nodes[0],
);
// Chat login (Keychain-signed challenge). CHAT_AUTH=required|optional|off, default required.
// Tests default to off so the existing suites can connect with ?username=.
const authService = new AuthService(logger, {
  mode: process.env['CHAT_AUTH']
    ? parseAuthMode(process.env['CHAT_AUTH'])
    : (process.env['NODE_ENV'] === 'test' ? 'off' : 'required'),
  ...(process.env['CHAT_AUTH_SECRET'] ? { secret: process.env['CHAT_AUTH_SECRET'] } : {}),
  hiveNode: config.hive.nodes[0] ?? 'https://api.hive.blog'
});

// Cleanup function for tests
const cleanup = () => {
  chatService.cleanup();
  curationService.cleanup();
  muteService.cleanup();
  authService.cleanup();
};

// Export cleanup and authService for tests
export { cleanup, authService };

// Error handling
server.on('error', (error: Error) => {
  logger.error('Server error:', error);
});

io.engine.on('connection_error', (err: Error) => {
  logger.error('Connection error:', err);
});

// Chat login: verify the Keychain signature or session token before the
// socket is accepted. On failure in 'required' mode the client gets a
// connect_error whose message starts with 'auth_failed:'.
io.use((socket, next) => {
  const mode = authService.getMode();
  const payload = (socket.handshake.auth ?? {}) as AuthPayload;
  const claimed = payload.username ?? socket.handshake.query['username'];
  if (typeof claimed === 'string' && communityBans.isBanned(claimed)) {
    logger.info(`[CommunityBan] Refused chat for ${claimed}`);
    return next(new Error('auth_failed: banned'));
  }
  if (mode === 'off') return next();
  const hasCredentials = Boolean(payload.signature || payload.sessionToken);
  if (!hasCredentials) {
    if (mode === 'optional') {
      socket.data.verified = false;
      return next();
    }
    return next(new Error('auth_failed: missing credentials'));
  }
  authService.authenticate(payload).then((result) => {
    if (result.ok) {
      socket.data.verified = true;
      socket.data.username = result.username;
      socket.data.sessionToken = result.sessionToken;
      socket.data.authMethod = result.method;
      return next();
    }
    logger.warn(`[Auth] Rejected socket for ${String(payload.username)}: ${result.reason}`);
    if (mode === 'optional') {
      socket.data.verified = false;
      return next();
    }
    return next(new Error(`auth_failed: ${result.reason}`));
  }).catch((err) => {
    logger.error('[Auth] Unexpected error during authentication:', err);
    next(new Error('auth_failed: server error'));
  });
});

// Load the community's muted list now and every 10 minutes; anyone newly
// muted is told why and disconnected (the client doesn't reconnect after a
// server-side disconnect).
const kickBanned = (names: string[]) => {
  const banned = new Set(names);
  for (const s of io.sockets.sockets.values()) {
    const name = (s.data.username as string | undefined) ?? s.handshake.query['username'];
    if (typeof name === 'string' && banned.has(name.toLowerCase())) {
      s.emit('chatBanned', { reason: 'community' });
      s.disconnect(true);
      logger.info(`[CommunityBan] Disconnected ${name}`);
    }
  }
};
if (process.env['NODE_ENV'] !== 'test') {
  communityBans.start(kickBanned);
}
// communityBans' timer only runs outside tests, so cleanup() needn't stop it.
export { kickBanned, communityBans };

// Socket connection handling
io.on('connection', (socket) => {
  // A verified socket's name comes from its signature or token; the query
  // string is only trusted when chat login is off or optional.
  const username = (socket.data.username as string | undefined)
    ?? (socket.handshake.query['username'] as string);
  socket.data.guest = isGuestName(username);
  // Behind Render's proxy, handshake.address is the proxy, so every player
  // would share one rate-limit bucket. Use the client address the proxy
  // appended (rightmost X-Forwarded-For entry), matching `trust proxy = 1`.
  const userIP = getClientIP(socket.handshake.headers['x-forwarded-for'], socket.handshake.address);
  
  logger.info(`New socket connection: ${socket.id}, username: ${username}, IP: ${userIP}`);
  
  // Validate username is provided
  if (!username) {
    logger.warn('Connection attempt without username - disconnecting');
    socket.disconnect();
    return;
  }

  // Initialize rate limiting for this user (skip in test environment)
  let userLimit: {
    messageCount: number;
    lastReset: number;
    connections: number;
    joinLeaveCount: number;
    lastJoinLeaveReset: number;
    emoteCount: number;
    lastEmoteReset: number;
  } | undefined;
  
  if (process.env['NODE_ENV'] !== 'test') {
    if (!socketRateLimits.has(userIP)) {
      socketRateLimits.set(userIP, {
        messageCount: 0,
        lastReset: Date.now(),
        connections: 0,
        joinLeaveCount: 0,
        lastJoinLeaveReset: Date.now(),
        emoteCount: 0,
        lastEmoteReset: Date.now()
      });
    }
    
    userLimit = socketRateLimits.get(userIP)!;
    userLimit.connections++;
  }

  // Initialize user and register with username from query
  userService.handleConnection(socket);
  userService.registerUser(socket, username);
  if (socket.data.verified) {
    socket.emit('authenticated', { username, sessionToken: socket.data.sessionToken });
  }
  
  // Handle user registration
  socket.on('register', (data: RegisterData) => {
    const { username: registerUsername } = data;
    if (registerUsername && registerUsername !== username && socket.data.verified !== undefined) {
      // With chat login on, a socket can't switch to another account.
      socket.emit('registered', { success: false, error: 'Username does not match login' });
      return;
    }
    if (registerUsername && registerUsername !== username) {
      // If username in register event differs from query username, update it
      userService.registerUser(socket, registerUsername);
      const response: RegisterResponse = { success: true };
      socket.emit('registered', response);
    } else {
      const response: RegisterResponse = { success: true };
      socket.emit('registered', response);
    }
  });

  // Chat events with rate limiting
  socket.on('joinChatChannel', (data: JoinChatChannelData) => {
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
  
  socket.on('leaveChatChannel', (data: LeaveChatChannelData) => {
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
  
  socket.on('chatMessage', (data: ChatMessageData) => {
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
    if (!guestMessageAllowed(socket)) {
      socket.emit('error', { message: 'Guests can send a few messages a minute. Please wait a moment.' });
      return;
    }
    chatService.handleMessage(socket, { ...data, username });
  });
  
  // Room objects: the player says which object and verb they used in their
  // room; each receiver shows the line the room's author wrote. No text is relayed.
  socket.on('usedObject', async (data: { channelId?: unknown; object?: unknown; verb?: unknown }) => {
    const user = userService.getUserBySocket(socket.id);
    const channelId = typeof data?.channelId === 'string' ? data.channelId : '';
    const object = typeof data?.object === 'string' ? data.object : '';
    const verb = typeof data?.verb === 'string' ? data.verb : '';
    if (!user || !socket.rooms.has(channelId) || !/^[a-z][a-z0-9 -]{0,29}$/.test(object) || !/^[a-z]{2,15}$/.test(verb)) return;
    const now = Date.now();
    const window = socket.data.objectWindow as { start: number; count: number } | undefined;
    if (!window || now - window.start > 60000) socket.data.objectWindow = { start: now, count: 1 };
    else if (++window.count > 20) return;
    const receivers = await io.in(channelId).fetchSockets();
    for (const receiver of receivers) {
      if (receiver.id === socket.id) continue;
      const name = userService.getUserBySocket(receiver.id);
      if (name && await muteService.hasMuted(name, user).catch(() => false)) continue;
      receiver.emit('playerUsedObject', { username: user, channelId, object, verb });
    }
  });

  socket.on('emote', (data: EmoteData) => {
    // Rate limit emotes (skip in test environment)
    if (process.env['NODE_ENV'] !== 'test' && userLimit) {
      const now = Date.now();
      if (now - userLimit.lastEmoteReset > 60000) { // 1 minute
        userLimit.emoteCount = 0;
        userLimit.lastEmoteReset = now;
      }
      
      if (userLimit.emoteCount > 30) { // max 30 emotes per minute
        logger.warn(`Rate limit exceeded for emotes: ${socket.handshake.query['username']} (${userIP})`);
        socket.emit('error', { message: 'Too many emotes. Please wait a moment.' });
        return;
      }
      
      userLimit.emoteCount++;
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
    if (!guestMessageAllowed(socket)) {
      socket.emit('error', { message: 'Guests can send a few messages a minute. Please wait a moment.' });
      return;
    }
    
    chatService.handleEmote(socket, { channelId: data.channelId, emote: data.emote, username });
  });

  // Handle keepalive response
  // The client replies to a keepalive by emitting 'keepalive' back;
  // 'keepaliveResponse' is accepted too for compatibility.
  socket.on('keepaliveResponse', () => {
    chatService.handleKeepaliveResponse(socket);
  });
  socket.on('keepalive', () => {
    chatService.handleKeepaliveResponse(socket);
  });

  // Builder path — client claims eligibility; server verifies on-chain and promotes
  // The player changed their Hive mute list; reload it instead of waiting for the cache.
  socket.on('refreshMutes', () => {
    const who = userService.getUserBySocket(socket.id);
    if (who && socket.data.verified !== false) {
      muteService.refresh(who);
    }
  });

  socket.on('claimBuilder', async () => {
    const claimant = userService.getUserBySocket(socket.id);
    if (!claimant) {
      logger.warn('[Builder] claimBuilder received from unregistered socket');
      return;
    }
    if (socket.data.guest) {
      logger.info(`[Builder] Ignoring builder claim from guest ${claimant}`);
      return;
    }
    logger.info(`[Builder] ${claimant} is claiming builder eligibility`);
    const result = await builderService.verifyAndPromote(claimant);
    if (result.granted) {
      socket.emit('builderGranted', { username: claimant });
      logger.info(`[Builder] Builder title granted to ${claimant}`);
    } else {
      logger.info(`[Builder] Builder claim denied for ${claimant}: ${result.reason}`);
    }
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

// Chat login challenge. The client signs this with Keychain (posting key)
// and sends it in the socket handshake.
app.get('/auth/challenge', (req: Request, res: Response) => {
  const username = typeof req.query['username'] === 'string' ? req.query['username'] : '';
  const issued = authService.issueChallenge(username);
  if (!issued) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }
  res.json({ ...issued, mode: authService.getMode() });
});

// Guest identity for players without a Hive account. Returns a server-chosen
// Guest-NNNNNN name and a 90-day token used in the socket handshake.
app.get('/auth/guest', process.env['NODE_ENV'] === 'test' ? (_req: Request, _res: Response, next: () => void) => next() : guestLimiter, (_req: Request, res: Response) => {
  if (authService.getMode() === 'off') {
    res.status(404).json({ error: 'Guest accounts are not enabled' });
    return;
  }
  res.json(authService.issueGuest());
});

// Curation counts visits from players' move_to ops on Hive (rolling 24 h),
// not from chat joins. CURATION_VISITS=chat restores the old behaviour.
const chainVisits = process.env['CURATION_VISITS'] === 'chat'
  ? null
  : new ChainVisitService(
    logger,
    new BlockRangeMoveSource(
      logger,
      [...new Set([...config.hive.nodes, 'https://api.openhive.network'])],
      parseInt(process.env['CHAIN_VISITS_BATCH'] || '') || 200,
    ),
    {
      gameId: config.game.idName,
      isKnownRoom: (author, permlink) => roomRegistry.isKnownRoom(author, permlink),
      isMapLoaded: () => roomRegistry.isLoaded(),
    },
  );
if (chainVisits) {
  curationService.setVisitSource(chainVisits);
  if (process.env['NODE_ENV'] !== 'test') chainVisits.start();
}
export { chainVisits };

// Curation dry run endpoint. `visits` shows where counts come from and what
// reading the chain costs (blocks, MB downloaded, catch-up time).
app.get('/curation/dryrun', (_req: Request, res: Response) => {
  const rooms = curationService.getDryRun();
  res.json({
    timestamp: new Date().toISOString(),
    visits: chainVisits ? chainVisits.getStats() : { source: 'chat joins' },
    wouldVoteOn: rooms.slice(0, curationService.getTopN()),
    fullRanking: rooms
  });
});

// Health check endpoint
// Public endpoint: counts only. Usernames, admin accounts and channel names
// (which reveal where players are) are not exposed.
app.get('/health', (_req: Request, res: Response) => {
  const chat = chatService.getStatus();
  const users = userService.getStatus();
  const response: HealthCheckResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      chat: { activeChannels: chat.activeChannels, connectedUsers: chat.connectedUsers },
      users: { connectedUsers: users.connectedUsers, totalSessions: users.totalSessions }
    }
  };
  res.json(response);
});

// Basic HTTP GET route for the root path
app.get('/', (_req: Request, res: Response) => {
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

export { app, server, io }; 