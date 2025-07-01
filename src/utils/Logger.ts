import { Logger as LoggerInterface } from '../types';

class Logger implements LoggerInterface {
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  private _log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}]`, ...args);
  }

  info(message: string, ...args: any[]): void {
    this._log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this._log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this._log('error', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel === 'debug') {
      this._log('debug', message, ...args);
    }
  }
}

export default Logger; 