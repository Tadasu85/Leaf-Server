import config from '../src/config';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export configuration object', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('should have required configuration properties', () => {
    expect(config).toHaveProperty('hive');
    expect(config).toHaveProperty('game');
    expect(config).toHaveProperty('signalingServer');
    expect(config).toHaveProperty('admins');
    expect(config).toHaveProperty('builders');
  });

  it('should have proper hive configuration', () => {
    expect(config.hive).toHaveProperty('nodes');
    expect(Array.isArray(config.hive.nodes)).toBe(true);
    expect(config.hive.nodes.length).toBeGreaterThan(0);
  });

  it('should have proper game configuration', () => {
    expect(config.game).toHaveProperty('idName');
    expect(config.game).toHaveProperty('account');
    expect(typeof config.game.idName).toBe('string');
    expect(typeof config.game.account).toBe('string');
  });

  it('should have proper admin and builder arrays', () => {
    expect(Array.isArray(config.admins)).toBe(true);
    expect(Array.isArray(config.builders)).toBe(true);
    expect(config.admins.length).toBeGreaterThan(0);
    expect(config.builders.length).toBeGreaterThan(0);
  });

  describe('Signaling Server Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use environment variable for signaling server when provided', () => {
      process.env['REACT_APP_SIGNALING_SERVER'] = 'https://custom-signaling.com';
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('https://custom-signaling.com');
    });

    it('should use production signaling server in production environment', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['REACT_APP_PRODUCTION_SIGNALING_SERVER'] = 'https://prod-signaling.com';
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('https://prod-signaling.com');
    });

    it('should use default production signaling server when production URL not provided', () => {
      process.env['NODE_ENV'] = 'production';
      delete process.env['REACT_APP_PRODUCTION_SIGNALING_SERVER'];
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('https://leaf-server-23ov.onrender.com');
    });

    it('should use localhost in non-production environment when no signaling server provided', () => {
      process.env['NODE_ENV'] = 'development';
      delete process.env['REACT_APP_SIGNALING_SERVER'];
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('http://localhost:4001');
    });

    it('should use localhost when NODE_ENV is not set and no signaling server provided', () => {
      delete process.env['NODE_ENV'];
      delete process.env['REACT_APP_SIGNALING_SERVER'];
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('http://localhost:4001');
    });

    it('should use production signaling server when both NODE_ENV and REACT_APP_PRODUCTION_SIGNALING_SERVER are set', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['REACT_APP_PRODUCTION_SIGNALING_SERVER'] = 'https://custom-prod-signaling.com';
      
      const config = require('../src/config').default;
      expect(config.signalingServer).toBe('https://custom-prod-signaling.com');
    });
  });

  describe('Environment Variable Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use environment variable for hive node when provided', () => {
      process.env['REACT_APP_HIVE_NODE'] = 'https://custom-hive-node.com';
      
      const config = require('../src/config').default;
      expect(config.hive.nodes[0]).toBe('https://custom-hive-node.com');
    });

    it('should use default hive node when environment variable not provided', () => {
      delete process.env['REACT_APP_HIVE_NODE'];
      
      const config = require('../src/config').default;
      expect(config.hive.nodes[0]).toBe('https://api.hive.blog');
    });

    it('should use environment variables for game configuration when provided', () => {
      process.env['REACT_APP_GAME_ID_NAME'] = 'custom-game';
      process.env['REACT_APP_ACCOUNT_NAME'] = 'custom-account';
      
      const config = require('../src/config').default;
      expect(config.game.idName).toBe('custom-game');
      expect(config.game.account).toBe('custom-account');
    });

    it('should use default game configuration when environment variables not provided', () => {
      delete process.env['REACT_APP_GAME_ID_NAME'];
      delete process.env['REACT_APP_ACCOUNT_NAME'];
      
      const config = require('../src/config').default;
      expect(config.game.idName).toBe('ego-death');
      expect(config.game.account).toBe('hive-109456');
    });

    it('should use environment variable for admin accounts when provided', () => {
      process.env['REACT_APP_ACCOUNT_NAME'] = 'custom-admin';
      
      const config = require('../src/config').default;
      expect(config.admins[0]).toBe('custom-admin');
    });

    it('should use default admin account when environment variable not provided', () => {
      delete process.env['REACT_APP_ACCOUNT_NAME'];
      
      const config = require('../src/config').default;
      expect(config.admins[0]).toBe('hive-109456');
    });

    it('should have consistent account name across game config and admins', () => {
      process.env['REACT_APP_ACCOUNT_NAME'] = 'consistent-account';
      
      const config = require('../src/config').default;
      expect(config.game.account).toBe('consistent-account');
      expect(config.admins[0]).toBe('consistent-account');
    });
  });
}); 