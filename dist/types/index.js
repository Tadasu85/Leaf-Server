"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateHiveConfig = validateHiveConfig;
exports.validateGameConfig = validateGameConfig;
exports.validateServerConfig = validateServerConfig;
exports.createDefaultChatChannel = createDefaultChatChannel;
exports.createDefaultUserSession = createDefaultUserSession;
// Utility functions for type validation
function validateHiveConfig(config) {
    return Array.isArray(config.nodes) && config.nodes.length > 0;
}
function validateGameConfig(config) {
    return typeof config.idName === 'string' && typeof config.account === 'string';
}
function validateServerConfig(config) {
    return validateHiveConfig(config.hive) &&
        validateGameConfig(config.game) &&
        typeof config.signalingServer === 'string';
}
function createDefaultChatChannel(channelId) {
    return {
        players: [],
        lastUpdated: Date.now(),
        // Include channelId to avoid unused parameter warning
        ...(channelId ? { channelId } : {})
    };
}
function createDefaultUserSession(username, socketId) {
    return {
        username,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        isOnline: true,
        socketId
    };
}
//# sourceMappingURL=index.js.map