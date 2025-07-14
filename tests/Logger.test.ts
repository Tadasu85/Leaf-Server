import Logger from '../src/utils/Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('info'); // Explicitly set to info level for testing
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('info', () => {
    it('should log info messages with timestamp and level', () => {
      logger.info('Test info message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\]/),
        'Test info message'
      );
    });

    it('should handle multiple arguments', () => {
      logger.info('Test message', { key: 'value' }, 123);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\]/),
        'Test message',
        { key: 'value' },
        123
      );
    });
  });

  describe('warn', () => {
    it('should log warning messages with timestamp and level', () => {
      logger.warn('Test warning message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\]/),
        'Test warning message'
      );
    });
  });

  describe('error', () => {
    it('should log error messages with timestamp and level', () => {
      logger.error('Test error message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\]/),
        'Test error message'
      );
    });
  });

  describe('debug', () => {
    it('should not log debug messages by default', () => {
      const logger = new Logger();
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.debug('Debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log debug messages when log level is debug', () => {
      const logger = new Logger('debug');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.debug('Debug message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]/),
        'Debug message'
      );
      consoleSpy.mockRestore();
    });

    it('should not log debug messages when log level is warn', () => {
      const logger = new Logger('warn');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.debug('Debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not log debug messages when log level is error', () => {
      const logger = new Logger('error');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      logger.debug('Debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
}); 