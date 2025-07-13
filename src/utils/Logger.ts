import { Logger as LoggerInterface } from '../types';

class Logger implements LoggerInterface {
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel?: 'debug' | 'info' | 'warn' | 'error') {
    // Set log level based on environment if not provided
    if (!logLevel) {
      if (process.env['NODE_ENV'] === 'production') {
        this.logLevel = 'warn'; // Only warnings and errors in production
      } else if (process.env['NODE_ENV'] === 'test') {
        this.logLevel = 'error'; // Only errors in tests
      } else {
        this.logLevel = 'info'; // Full logging in development
      }
    } else {
      this.logLevel = logLevel;
    }
  }

  private _log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}]`, ...args);
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      this._log('info', message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      this._log('warn', message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      this._log('error', message, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      this._log('debug', message, ...args);
    }
  }
}

export default Logger; 