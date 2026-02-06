const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { adminLogin, validateToken, getAdminProfile } = require('../../src/features/auth/controllers');

// Mock dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../../src/shared/services/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('Auth Controllers - Happy Path Scenarios', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock request object
    mockReq = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      get: jest.fn(() => 'Mozilla/5.0 Test Browser')
    };

    // Mock response object
    mockRes = {
      status: jest.fn(() => mockRes),
      json: jest.fn(() => mockRes)
    };

    // Set up environment variables for tests
    process.env.ADMIN_EMAIL = 'admin@lesone.com';
    process.env.ADMIN_PASSWORD = 'admin123';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  describe('adminLogin - Happy Path', () => {
    test('should successfully login with valid credentials (plain text password)', async () => {
      // Arrange
      const validEmail = 'admin@lesone.com';
      const validPassword = 'admin123';
      const mockToken = 'mock-jwt-token-12345';
      
      mockReq.body = {
        email: validEmail,
        password: validPassword
      };

      // Mock JWT sign to return a token
      jwt.sign.mockReturnValue(mockToken);

      // Act
      await adminLogin(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        token: mockToken,
        expiresIn: '7d',
        admin: {
          email: validEmail,
          role: 'admin'
        }
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          email: validEmail,
          role: 'admin',
          iat: expect.any(Number)
        },
        'test-jwt-secret',
        { expiresIn: '7d' }
      );
    });

    test('should successfully login with valid credentials (hashed password)', async () => {
      // Arrange
      const validEmail = 'admin@lesone.com';
      const validPassword = 'admin123';
      const hashedPassword = '$2b$12$hashedPasswordExample';
      const mockToken = 'mock-jwt-token-67890';
      
      // Set hashed password in env
      process.env.ADMIN_PASSWORD = hashedPassword;
      
      mockReq.body = {
        email: validEmail,
        password: validPassword
      };

      // Mock bcrypt to return true for valid password
      bcrypt.compare.mockResolvedValue(true);
      
      // Mock JWT sign to return a token
      jwt.sign.mockReturnValue(mockToken);

      // Act
      await adminLogin(mockReq, mockRes);

      // Assert
      expect(bcrypt.compare).toHaveBeenCalledWith(validPassword, hashedPassword);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        token: mockToken,
        expiresIn: '7d',
        admin: {
          email: validEmail,
          role: 'admin'
        }
      });
    });

    test('should use default JWT expiration when JWT_EXPIRES_IN is not set', async () => {
      // Arrange
      delete process.env.JWT_EXPIRES_IN; // Remove the env var
      
      mockReq.body = {
        email: 'admin@lesone.com',
        password: 'admin123'
      };

      jwt.sign.mockReturnValue('mock-token');

      // Act
      await adminLogin(mockReq, mockRes);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        'test-jwt-secret',
        { expiresIn: '24h' } // Should default to 24h
      );
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresIn: '24h'
        })
      );
    });
  });

  describe('validateToken - Happy Path', () => {
    test('should successfully validate a valid JWT token', async () => {
      // Arrange
      const mockToken = 'valid-jwt-token';
      const mockDecodedToken = {
        email: 'admin@lesone.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 days
      };

      mockReq.headers.authorization = `Bearer ${mockToken}`;

      // Mock JWT verify to return decoded token
      jwt.verify.mockReturnValue(mockDecodedToken);

      // Act
      await validateToken(mockReq, mockRes);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, 'test-jwt-secret');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Token is valid',
        admin: {
          email: mockDecodedToken.email,
          role: mockDecodedToken.role
        },
        expiresAt: new Date(mockDecodedToken.exp * 1000).toISOString()
      });
    });

    test('should successfully validate token with different admin email', async () => {
      // Arrange
      const mockToken = 'another-valid-jwt-token';
      const mockDecodedToken = {
        email: 'admin@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
      };

      mockReq.headers.authorization = `Bearer ${mockToken}`;
      jwt.verify.mockReturnValue(mockDecodedToken);

      // Act
      await validateToken(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Token is valid',
        admin: {
          email: 'admin@example.com',
          role: 'admin'
        },
        expiresAt: new Date(mockDecodedToken.exp * 1000).toISOString()
      });
    });
  });

  describe('getAdminProfile - Happy Path', () => {
    test('should successfully retrieve admin profile with valid token', async () => {
      // Arrange
      const mockToken = 'valid-profile-token';
      const mockDecodedToken = {
        email: 'admin@lesone.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        exp: Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60 // 6 days from now
      };

      mockReq.headers.authorization = `Bearer ${mockToken}`;
      jwt.verify.mockReturnValue(mockDecodedToken);

      // Act
      await getAdminProfile(mockReq, mockRes);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, 'test-jwt-secret');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin profile retrieved successfully',
        admin: {
          email: mockDecodedToken.email,
          role: mockDecodedToken.role,
          loginTime: new Date(mockDecodedToken.iat * 1000).toISOString(),
          expiresAt: new Date(mockDecodedToken.exp * 1000).toISOString()
        }
      });
    });

    test('should retrieve profile with correct timestamp conversions', async () => {
      // Arrange
      const specificIat = 1672531200; // 2023-01-01 00:00:00 UTC
      const specificExp = 1673136000; // 2023-01-08 00:00:00 UTC
      
      const mockToken = 'timestamp-test-token';
      const mockDecodedToken = {
        email: 'admin@lesone.com',
        role: 'admin',
        iat: specificIat,
        exp: specificExp
      };

      mockReq.headers.authorization = `Bearer ${mockToken}`;
      jwt.verify.mockReturnValue(mockDecodedToken);

      // Act
      await getAdminProfile(mockReq, mockRes);

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Admin profile retrieved successfully',
        admin: {
          email: 'admin@lesone.com',
          role: 'admin',
          loginTime: '2023-01-01T00:00:00.000Z',
          expiresAt: '2023-01-08T00:00:00.000Z'
        }
      });
    });

    test('should handle different admin roles correctly', async () => {
      // Arrange
      const mockToken = 'role-test-token';
      const mockDecodedToken = {
        email: 'superadmin@lesone.com',
        role: 'admin', // Should still work with admin role
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
      };

      mockReq.headers.authorization = `Bearer ${mockToken}`;
      jwt.verify.mockReturnValue(mockDecodedToken);

      // Act
      await getAdminProfile(mockReq, mockRes);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          admin: expect.objectContaining({
            email: 'superadmin@lesone.com',
            role: 'admin'
          })
        })
      );
    });
  });

  describe('Performance and Logging - Happy Path', () => {
    test('should complete login within reasonable time and log success', async () => {
      // Arrange
      const startTime = Date.now();
      
      mockReq.body = {
        email: 'admin@lesone.com',
        password: 'admin123'
      };

      jwt.sign.mockReturnValue('performance-test-token');

      // Act
      await adminLogin(mockReq, mockRes);
      const endTime = Date.now();

      // Assert
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      
      // Verify that logger.info was called for successful login
      const logger = require('../../src/shared/services/logger');
      expect(logger.info).toHaveBeenCalledWith(
        'Admin login successful',
        expect.objectContaining({
          action: 'admin_login_success',
          admin_email: 'admin@lesone.com',
          ip_address: '127.0.0.1',
          session_duration: '7d'
        })
      );
    });

    test('should handle concurrent login requests successfully', async () => {
      // Arrange
      const requests = Array.from({ length: 3 }, (_, i) => ({
        ...mockReq,
        body: {
          email: 'admin@lesone.com',
          password: 'admin123'
        }
      }));

      const responses = Array.from({ length: 3 }, (_, i) => ({
        status: jest.fn(() => responses[i]),
        json: jest.fn(() => responses[i])
      }));

      jwt.sign.mockReturnValue('concurrent-test-token');

      // Act
      const promises = requests.map((req, i) => adminLogin(req, responses[i]));
      await Promise.all(promises);

      // Assert
      responses.forEach(res => {
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: 'Login successful'
          })
        );
      });
    });
  });
});