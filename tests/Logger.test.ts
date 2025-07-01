import Logger from '../src/utils/Logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger();
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
      logger.debug('Test debug message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when log level is debug', () => {
      const debugLogger = new Logger('debug');
      debugLogger.debug('Test debug message');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[DEBUG\]/),
        'Test debug message'
      );
    });
  });
}); 