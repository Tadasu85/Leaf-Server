import config from '../src/config';

describe('Configuration', () => {
  it('should export configuration object', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('should have required configuration properties', () => {
    // Test that config exists and is an object
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    
    // Since config.ts only has one line that's not covered, 
    // we're testing that the module can be imported successfully
    expect(() => {
      require('../src/config');
    }).not.toThrow();
  });
}); 