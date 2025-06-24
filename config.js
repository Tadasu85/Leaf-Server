/**
 * Server-side configuration for the Leaf game signaling server
 * Mirrors the React app config structure for consistency
 */

/**
 * Configuration interface for Hive blockchain connection settings
 */
const hiveConfig = {
  /** Array of Hive node URLs for blockchain connection */
  nodes: [process.env.REACT_APP_HIVE_NODE || 'https://api.hive.blog'],
};

/**
 * Configuration interface for game-specific settings
 */
const gameConfig = {
  /** Unique identifier for the game used in custom JSON operations */
  idName: process.env.REACT_APP_GAME_ID_NAME || 'ego-death',
  /** Main game account name used for admin checks and blockchain operations */
  account: process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456',
  /** Starting room configuration for new players */
  startRoom: {
    /** Author of the starting room post */
    author: process.env.REACT_APP_GAME_STARTING_ROOM_AUTHOR || 'raymonjohnstone',
    /** Permlink of the starting room post */
    permlink: process.env.REACT_APP_GAME_STARTING_ROOM_PERMLINK || 'genesis-scaffold-precipice'
  },
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
  signalingServer: process.env.REACT_APP_SIGNALING_SERVER || 'http://localhost:4001',
  /** Array of admin usernames with full access */
  admins: [process.env.REACT_APP_ACCOUNT_NAME || 'hive-109456'],
  /** Array of builder usernames with room creation permissions */
  builders: ['raymonjohnstone'],
};

module.exports = config; 