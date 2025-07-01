"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Configuration interface for Hive blockchain connection settings
 */
const hiveConfig = {
    /** Array of Hive node URLs for blockchain connection */
    nodes: [process.env['REACT_APP_HIVE_NODE'] || 'https://api.hive.blog'],
};
/**
 * Configuration interface for game-specific settings
 */
const gameConfig = {
    /** Unique identifier for the game used in custom JSON operations */
    idName: process.env['REACT_APP_GAME_ID_NAME'] || 'ego-death',
    /** Main game account name used for admin checks and blockchain operations */
    account: process.env['REACT_APP_ACCOUNT_NAME'] || 'hive-109456',
};
/**
 * Main configuration for the Leaf game signaling server
 */
const config = {
    /** Hive blockchain connection settings */
    hive: hiveConfig,
    /** Game-specific configuration */
    game: gameConfig,
    /** WebSocket signaling server URL for real-time communication */
    signalingServer: process.env['REACT_APP_SIGNALING_SERVER'] ||
        (process.env['NODE_ENV'] === 'production'
            ? (process.env['REACT_APP_PRODUCTION_SIGNALING_SERVER'] || 'https://leaf-server-23ov.onrender.com')
            : 'http://localhost:4001'),
    /** Array of admin usernames with full access */
    admins: [process.env['REACT_APP_ACCOUNT_NAME'] || 'hive-109456'],
    /** Array of builder usernames with room creation permissions */
    builders: ['raymonjohnstone'],
};
exports.default = config;
//# sourceMappingURL=config.js.map