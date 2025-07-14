import { Logger as LoggerInterface } from '../types';
declare class Logger implements LoggerInterface {
    private logLevel;
    constructor(logLevel?: 'debug' | 'info' | 'warn' | 'error');
    private _log;
    private shouldLog;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}
export default Logger;
//# sourceMappingURL=Logger.d.ts.map