const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

/**
 * JWT Authentication Middleware
 * Validates JWT token and adds admin info to req.admin
 * Use this middleware to protect admin routes
 */
const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed - no token provided', {
        action: 'auth_failed',
        reason: 'no_token',
        path: req.path,
        method: req.method,
        ip_address: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'Authentication token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT secret not configured', {
        action: 'auth_failed',
        reason: 'jwt_config_error',
        timestamp: new Date().toISOString()
      });

      return res.status(500).json({
        success: false,
        error: 'Authentication service unavailable',
        message: 'Please try again later'
      });
    }

    // Verify and decode the token
    const decoded = jwt.verify(token, jwtSecret);
    
    // Add admin info to request object
    req.admin = {
      email: decoded.email,
      role: decoded.role,
      tokenIssuedAt: new Date(decoded.iat * 1000),
      tokenExpiresAt: new Date(decoded.exp * 1000)
    };

    logger.debug('Admin authenticated successfully', {
      action: 'auth_success',
      admin_email: decoded.email,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    next();

  } catch (error) {
    let errorResponse = {
      success: false,
      error: 'Authentication failed',
      message: 'Please login again'
    };

    if (error.name === 'JsonWebTokenError') {
      logger.warn('Authentication failed - invalid token', {
        action: 'auth_failed',
        reason: 'invalid_token',
        error: error.message,
        path: req.path,
        method: req.method,
        ip_address: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString()
      });

      errorResponse.error = 'Invalid token';
    } else if (error.name === 'TokenExpiredError') {
      logger.warn('Authentication failed - token expired', {
        action: 'auth_failed',
        reason: 'token_expired',
        expired_at: error.expiredAt,
        path: req.path,
        method: req.method,
        ip_address: req.ip || req.connection.remoteAddress,
        timestamp: new Date().toISOString()
      });

      errorResponse.error = 'Token expired';
    } else {
      logger.error('Authentication system error', {
        action: 'auth_failed',
        reason: 'system_error',
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      errorResponse = {
        success: false,
        error: 'Authentication service error',
        message: 'Please try again later'
      };
    }

    return res.status(401).json(errorResponse);
  }
};

/**
 * Optional Authentication Middleware
 * Adds admin info to req.admin if valid token exists, but doesn't block request if no token
 * Use for routes that work for both authenticated and unauthenticated users
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      req.admin = null;
      return next();
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      req.admin = null;
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret);
    
    req.admin = {
      email: decoded.email,
      role: decoded.role,
      tokenIssuedAt: new Date(decoded.iat * 1000),
      tokenExpiresAt: new Date(decoded.exp * 1000)
    };

    next();

  } catch (error) {
    // Token exists but is invalid/expired, continue without authentication
    req.admin = null;
    next();
  }
};

/**
 * Admin Role Middleware
 * Ensures the authenticated user has admin role
 * Use after authenticateAdmin middleware
 */
const requireAdminRole = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please authenticate first'
    });
  }

  if (req.admin.role !== 'admin') {
    logger.warn('Authorization failed - insufficient privileges', {
      action: 'authorization_failed',
      user_role: req.admin.role,
      required_role: 'admin',
      admin_email: req.admin.email,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    return res.status(403).json({
      success: false,
      error: 'Access forbidden',
      message: 'Admin privileges required'
    });
  }

  next();
};

module.exports = {
  authenticateAdmin,
  optionalAuth,
  requireAdminRole
};