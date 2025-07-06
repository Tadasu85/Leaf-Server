import request from 'supertest';
import { app, cleanup } from '../src/server';

describe('Server Integration Tests', () => {
  afterAll(() => {
    // Clean up any intervals created by services
    cleanup();
  });

  describe('Health Check Endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('chat');
      expect(response.body.services).toHaveProperty('users');
    });
  });

  describe('Root Endpoint', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
    });
  });
}); 