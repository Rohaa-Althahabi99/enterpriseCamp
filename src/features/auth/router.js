const express = require('express');
const router = express.Router();
const { adminLogin, validateToken, getAdminProfile } = require('./controllers');
const logger = require('../../shared/services/logger');

// Rate limiting middleware (basic implementation)
const rateLimit = new Map();
const rateLimitWindow = 15 * 60 * 1000; // 15 minutes
const maxAttempts = 15;

const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimit.has(clientIp)) {
    rateLimit.set(clientIp, { count: 0, firstAttempt: now });
  }
  
  const clientData = rateLimit.get(clientIp);
  
  // Reset counter if window has passed
  if (now - clientData.firstAttempt > rateLimitWindow) {
    clientData.count = 0;
    clientData.firstAttempt = now;
  }
  
  if (clientData.count >= maxAttempts) {
    logger.warn('Rate limit exceeded for IP', {
      action: 'rate_limit_exceeded',
      ip_address: clientIp,
      attempts: clientData.count,
      timestamp: new Date().toISOString()
    });
    
    return res.status(429).json({
      success: false,
      error: 'Too many attempts',
      message: 'Please try again later',
      retryAfter: Math.ceil((rateLimitWindow - (now - clientData.firstAttempt)) / 1000)
    });
  }
  
  clientData.count++;
  next();
};

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminLoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Admin email address
 *           example: admin@lesone.com
 *         password:
 *           type: string
 *           description: Admin password
 *           example: admin123
 *     AdminLoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Login successful
 *         token:
 *           type: string
 *           description: JWT authentication token
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         expiresIn:
 *           type: string
 *           example: 7d
 *         admin:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               example: admin@lesone.com
 *             role:
 *               type: string
 *               example: admin
 *     AdminProfile:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Admin profile retrieved successfully
 *         admin:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               example: admin@lesone.com
 *             role:
 *               type: string
 *               example: admin
 *             loginTime:
 *               type: string
 *               format: date-time
 *               example: 2026-02-06T10:30:00.000Z
 *             expiresAt:
 *               type: string
 *               format: date-time
 *               example: 2026-02-13T10:30:00.000Z
 *     TokenValidationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Token is valid
 *         admin:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               example: admin@lesone.com
 *             role:
 *               type: string
 *               example: admin
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           example: 2026-02-13T10:30:00.000Z
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           example: Invalid credentials
 *         message:
 *           type: string
 *           example: Please check your email and password
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Admin login authentication
 *     description: Authenticates admin user with email and password, returns JWT token for accessing protected routes. Implements UC-001 from use case document.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminLoginResponse'
 *       400:
 *         description: Bad request - missing email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests - rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', rateLimitMiddleware, adminLogin);

/**
 * @swagger
 * /api/v1/auth/validate:
 *   get:
 *     summary: Validate JWT token
 *     description: Validates the provided JWT token and returns admin information if valid
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TokenValidationResponse'
 *       401:
 *         description: Unauthorized - invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/validate', validateToken);

/**
 * @swagger
 * /api/v1/auth/profile:
 *   get:
 *     summary: Get admin profile
 *     description: Returns current admin profile information from JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminProfile'
 *       401:
 *         description: Unauthorized - invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/profile', getAdminProfile);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Admin logout (client-side)
 *     description: Provides logout confirmation. Actual token invalidation happens on client-side by removing the token from storage.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logout successful. Please remove token from client storage.
 */
router.post('/logout', (req, res) => {
  // Since we're using stateless JWT tokens, logout is handled client-side
  logger.info('Admin logout requested', {
    action: 'admin_logout',
    timestamp: new Date().toISOString(),
    ip_address: req.ip || req.connection.remoteAddress
  });

  res.status(200).json({
    success: true,
    message: 'Logout successful. Please remove token from client storage.',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware for auth routes
router.use((error, req, res, next) => {
  logger.error('Auth router error', {
    action: 'auth_error',
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    success: false,
    error: 'Authentication service error',
    message: 'An unexpected error occurred'
  });
});

module.exports = router;
