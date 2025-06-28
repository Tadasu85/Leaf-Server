class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  // Helper function for timestamped logging
  log(level, ...args) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}]`, ...args);
  }

  info(...args) {
    this.log('info', ...args);
  }

  error(...args) {
    this.log('error', ...args);
  }

  warn(...args) {
    this.log('warn', ...args);
  }

  debug(...args) {
    if (this.logLevel === 'debug') {
      this.log('debug', ...args);
    }
  }

  // Legacy method for backward compatibility
  log(...args) {
    this.info(...args);
  }
}

module.exports = Logger; 