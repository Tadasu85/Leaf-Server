class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  // Helper function for timestamped logging
  _log(level, ...args) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}]`, ...args);
  }

  info(...args) {
    this._log('info', ...args);
  }

  error(...args) {
    this._log('error', ...args);
  }

  warn(...args) {
    this._log('warn', ...args);
  }

  debug(...args) {
    if (this.logLevel === 'debug') {
      this._log('debug', ...args);
    }
  }

  // Legacy method for backward compatibility
  log(...args) {
    this._log('info', ...args);
  }
}

module.exports = Logger; 