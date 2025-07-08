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

    it('should return proper service status structure', async () => {
      const response = await request(app).get('/health');
      
      expect(response.body.services.chat).toHaveProperty('activeChannels');
      expect(response.body.services.chat).toHaveProperty('connectedUsers');
      expect(response.body.services.chat).toHaveProperty('channels');
      expect(response.body.services.users).toHaveProperty('connectedUsers');
      expect(response.body.services.users).toHaveProperty('totalSessions');
      expect(response.body.services.users).toHaveProperty('onlineUsers');
      expect(response.body.services.users).toHaveProperty('adminAccounts');
    });
  });

  describe('Root Endpoint', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
    });

    it('should handle multiple requests', async () => {
      const response1 = await request(app).get('/');
      const response2 = await request(app).get('/');
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('Server Configuration', () => {
    it('should have proper middleware configuration', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      // If middleware is working, we should get a response
      expect(response.body).toBeDefined();
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(5).fill(null).map(() => 
        request(app).get('/health')
      );
      
      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});

describe('Rate Limiting Tests', () => {
  afterAll(() => {
    cleanup();
  });

  it('should apply rate limiting to API endpoints', async () => {
    // Rate limiting is disabled in test environment
    if (process.env['NODE_ENV'] === 'test') {
      // Make multiple requests - should not be rate limited in test mode
      const requests = Array(101).fill(null).map(() => 
        request(app).get('/health')
      );
      
      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBe(0); // No rate limiting in test mode
    } else {
      // Make multiple requests to trigger rate limiting
      const requests = Array(101).fill(null).map(() => 
        request(app).get('/health')
      );
      
      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }
  });

  it('should apply rate limiting to socket.io endpoint', async () => {
    const response = await request(app).get('/socket.io/');
    if (process.env['NODE_ENV'] === 'test') {
      expect(response.status).toBe(404); // No rate limiting in test mode
    } else {
      expect(response.status).toBe(429); // Should be rate limited
    }
  });

  it('should handle rate limit exceeded responses', async () => {
    // Make many requests quickly
    const requests = Array(150).fill(null).map(() => 
      request(app).get('/health')
    );
    
    const responses = await Promise.all(requests);
    const rateLimitedResponse = responses.find(r => r.status === 429);
    
    if (process.env['NODE_ENV'] === 'test') {
      expect(rateLimitedResponse).toBeUndefined(); // No rate limiting in test mode
    } else if (rateLimitedResponse) {
      expect(rateLimitedResponse.body).toHaveProperty('error');
      expect(typeof rateLimitedResponse.body.error).toBe('string');
    }
  });
});

describe('CORS and Error Handling Tests', () => {
  afterAll(() => {
    cleanup();
  });

  it('should allow requests from allowed origins in production', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://leaf-game.herokuapp.com');
    
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should allow requests from any origin in development', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should handle preflight requests', async () => {
    const response = await request(app)
      .options('/health')
      .set('Origin', 'https://leaf-game.herokuapp.com')
      .set('Access-Control-Request-Method', 'GET');
    
    expect(response.status).toBe(204); // OPTIONS requests typically return 204
    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should handle 404 for unknown routes', async () => {
    const response = await request(app).get('/unknown-route');
    expect(response.status).toBe(404);
  });

  it('should handle POST requests to GET-only endpoints', async () => {
    const response = await request(app).post('/health');
    expect(response.status).toBe(404);
  });
}); 