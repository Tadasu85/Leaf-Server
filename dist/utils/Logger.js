"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Logger {
    constructor(logLevel = 'info') {
        this.logLevel = logLevel;
    }
    _log(level, ...args) {
        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase();
        console.log(`[${timestamp}] [${levelUpper}]`, ...args);
    }
    info(message, ...args) {
        this._log('info', message, ...args);
    }
    warn(message, ...args) {
        this._log('warn', message, ...args);
    }
    error(message, ...args) {
        this._log('error', message, ...args);
    }
    debug(message, ...args) {
        if (this.logLevel === 'debug') {
            this._log('debug', message, ...args);
        }
    }
}
exports.default = Logger;
//# sourceMappingURL=Logger.js.map