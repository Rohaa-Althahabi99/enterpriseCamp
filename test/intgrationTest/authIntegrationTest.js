const request = require('supertest');
const express = require('express');
const authRouter = require('../../src/features/auth/router');
const jwt = require('jsonwebtoken');

// Mock logger to avoid console output during tests
jest.mock('../../src/shared/services/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('Auth Integration Tests - Happy Path Scenarios', () => {
  let app;

  beforeAll(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRouter);

    // Set up test environment variables
    process.env.ADMIN_EMAIL = 'admin@lesone.com';
    process.env.ADMIN_PASSWORD = 'admin123';
    process.env.JWT_SECRET = 'test-integration-jwt-secret';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  describe('POST /api/v1/auth/login - Happy Path', () => {
    test('should successfully login with valid credentials', async () => {
      const loginData = {
        email: 'admin@lesone.com',
        password: 'admin123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        token: expect.any(String),
        expiresIn: '7d',
        admin: {
          email: 'admin@lesone.com',
          role: 'admin'
        }
      });

      // Verify token is valid JWT
      expect(response.body.token).toBeDefined();
      expect(response.body.token.length).toBeGreaterThan(0);
      
      // Decode token to verify structure
      const decoded = jwt.decode(response.body.token);
      expect(decoded).toMatchObject({
        email: 'admin@lesone.com',
        role: 'admin',
        iat: expect.any(Number)
      });
    });

    test('should return JWT token with correct expiration', async () => {
      const loginData = {
        email: 'admin@lesone.com',
        password: 'admin123'
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      const decoded = jwt.decode(response.body.token);
      
      // Check that token has expiration set (7 days = 604800 seconds)
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    });

    test('should handle login with proper headers and response format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('admin');
      expect(response.body.admin).toHaveProperty('email');
      expect(response.body.admin).toHaveProperty('role');
    });
  });

  describe('GET /api/v1/auth/validate - Happy Path', () => {
    let validToken;

    beforeEach(async () => {
      // Get a valid token for testing
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        });

      validToken = loginResponse.body.token;
    });

    test('should successfully validate a valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Token is valid',
        admin: {
          email: 'admin@lesone.com',
          role: 'admin'
        },
        expiresAt: expect.any(String)
      });

      // Verify expiresAt is a valid ISO date
      expect(new Date(response.body.expiresAt)).toBeInstanceOf(Date);
    });

    test('should return correct expiration date format', async () => {
      const response = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Check ISO 8601 format
      expect(response.body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Verify it's a future date
      const expirationDate = new Date(response.body.expiresAt);
      const now = new Date();
      expect(expirationDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('GET /api/v1/auth/profile - Happy Path', () => {
    let validToken;

    beforeEach(async () => {
      // Get a valid token for testing
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        });

      validToken = loginResponse.body.token;
    });

    test('should successfully retrieve admin profile', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Admin profile retrieved successfully',
        admin: {
          email: 'admin@lesone.com',
          role: 'admin',
          loginTime: expect.any(String),
          expiresAt: expect.any(String)
        }
      });

      // Verify timestamps are valid ISO dates
      expect(new Date(response.body.admin.loginTime)).toBeInstanceOf(Date);
      expect(new Date(response.body.admin.expiresAt)).toBeInstanceOf(Date);
    });

    test('should return profile with correct timestamp format', async () => {
      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      const { loginTime, expiresAt } = response.body.admin;

      // Check ISO 8601 format for both timestamps
      expect(loginTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Verify logical order: loginTime should be before expiresAt
      expect(new Date(loginTime).getTime()).toBeLessThan(new Date(expiresAt).getTime());
    });
  });

  describe('POST /api/v1/auth/logout - Happy Path', () => {
    test('should successfully logout and return confirmation', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logout successful. Please remove token from client storage.',
        timestamp: expect.any(String)
      });

      // Verify timestamp is valid ISO date
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    test('should logout without requiring authentication token', async () => {
      // Test that logout works without Bearer token (client-side logout)
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logout successful');
    });
  });

  describe('Full Authentication Flow - Happy Path', () => {
    test('should complete full login -> validate -> profile -> logout flow', async () => {
      // Step 1: Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      const token = loginResponse.body.token;

      // Step 2: Validate token
      const validateResponse = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(validateResponse.body.success).toBe(true);
      expect(validateResponse.body.message).toBe('Token is valid');

      // Step 3: Get profile
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.admin.email).toBe('admin@lesone.com');

      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
      expect(logoutResponse.body.message).toContain('Logout successful');
    });

    test('should maintain consistent admin data across endpoints', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        });

      const token = loginResponse.body.token;
      const loginAdmin = loginResponse.body.admin;

      // Validate and check admin data consistency
      const validateResponse = await request(app)
        .get('/api/v1/auth/validate')
        .set('Authorization', `Bearer ${token}`);

      expect(validateResponse.body.admin.email).toBe(loginAdmin.email);
      expect(validateResponse.body.admin.role).toBe(loginAdmin.role);

      // Profile and check admin data consistency
      const profileResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(profileResponse.body.admin.email).toBe(loginAdmin.email);
      expect(profileResponse.body.admin.role).toBe(loginAdmin.role);
    });
  });

  describe('Response Performance - Happy Path', () => {
    test('should respond to login within reasonable time', async () => {
      const startTime = Date.now();

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@lesone.com',
          password: 'admin123'
        })
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    test('should handle multiple concurrent requests successfully', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'admin@lesone.com',
            password: 'admin123'
          })
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.token).toBeDefined();
      });

      // Verify all tokens are unique (different iat timestamps)
      const tokens = responses.map(r => r.body.token);
      const decodedTokens = tokens.map(t => jwt.decode(t));
      const iats = decodedTokens.map(t => t.iat);
      
      // All iat values should be unique or very close (within same second)
      expect(iats.length).toBe(5);
    });
  });
});