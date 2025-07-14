"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Logger {
    constructor(logLevel) {
        // Set log level based on environment if not provided
        if (!logLevel) {
            if (process.env['NODE_ENV'] === 'production') {
                this.logLevel = 'warn'; // Only warnings and errors in production
            }
            else if (process.env['NODE_ENV'] === 'test') {
                this.logLevel = 'error'; // Only errors in tests
            }
            else {
                this.logLevel = 'info'; // Full logging in development
            }
        }
        else {
            this.logLevel = logLevel;
        }
    }
    _log(level, ...args) {
        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase();
        console.log(`[${timestamp}] [${levelUpper}]`, ...args);
    }
    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.logLevel];
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            this._log('info', message, ...args);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            this._log('warn', message, ...args);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            this._log('error', message, ...args);
        }
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            this._log('debug', message, ...args);
        }
    }
}
exports.default = Logger;
//# sourceMappingURL=Logger.js.map