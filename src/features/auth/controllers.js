const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../../shared/services/logger');

/**
 * Admin Login Controller
 * Implements UC-001 - Admin Authentication from use case document
 */
const adminLogin = async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';

  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      logger.warn('Admin login attempt with missing credentials', {
        action: 'admin_login_failed',
        reason: 'missing_credentials',
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        message: 'Please provide both email and password'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn('Admin login attempt with invalid email format', {
        action: 'admin_login_failed',
        reason: 'invalid_email_format',
        email: email,
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Please check your email and password'
      });
    }

    // Get admin credentials from environment
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Check if environment variables are configured
    if (!adminEmail || !adminPassword) {
      logger.error('System configuration error - missing admin credentials', {
        action: 'admin_login_failed',
        reason: 'system_configuration_error',
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(500).json({
        success: false,
        error: 'System configuration error',
        message: 'Authentication service is temporarily unavailable'
      });
    }

    // Validate email against configured admin email
    if (email !== adminEmail) {
      logger.warn('Admin login attempt with invalid email', {
        action: 'admin_login_failed',
        reason: 'invalid_email',
        attempted_email: email,
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Please check your email and password'
      });
    }

    // Validate password
    let passwordValid = false;
    
    if (adminPassword.startsWith('$2b$')) {
      // Password is hashed with bcrypt
      passwordValid = await bcrypt.compare(password, adminPassword);
    } else {
      // Password is plain text (development only)
      passwordValid = password === adminPassword;
    }

    if (!passwordValid) {
      logger.warn('Admin login attempt with invalid password', {
        action: 'admin_login_failed',
        reason: 'invalid_password',
        email: email,
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Please check your email and password'
      });
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

    if (!jwtSecret) {
      logger.error('System configuration error - missing JWT secret', {
        action: 'admin_login_failed',
        reason: 'jwt_config_error',
        email: email,
        ip_address: clientIp,
        user_agent: userAgent,
        timestamp: new Date().toISOString()
      });

      return res.status(500).json({
        success: false,
        error: 'Authentication service unavailable',
        message: 'Please try again later'
      });
    }

    const tokenPayload = {
      email: adminEmail,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: jwtExpiresIn });

    // Log successful login
    const loginDuration = Date.now() - startTime;
    logger.info('Admin login successful', {
      action: 'admin_login_success',
      admin_email: adminEmail,
      ip_address: clientIp,
      user_agent: userAgent,
      session_duration: jwtExpiresIn,
      login_duration_ms: loginDuration,
      timestamp: new Date().toISOString()
    });

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      expiresIn: jwtExpiresIn,
      admin: {
        email: adminEmail,
        role: 'admin'
      }
    });

  } catch (error) {
    // Log system error
    logger.error('Admin login system error', {
      action: 'admin_login_failed',
      reason: 'system_error',
      error: error.message,
      stack: error.stack,
      ip_address: clientIp,
      user_agent: userAgent,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      error: 'System error',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
};

/**
 * Admin Token Validation Controller
 */
const validateToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'No valid token provided'
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    const decoded = jwt.verify(token, jwtSecret);

    return res.status(200).json({
      success: true,
      message: 'Token is valid',
      admin: {
        email: decoded.email,
        role: decoded.role
      },
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Please login again'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication service error',
      message: 'Please try again later'
    });
  }
};

/**
 * Admin Profile Controller
 */
const getAdminProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'No valid token provided'
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    const decoded = jwt.verify(token, jwtSecret);

    return res.status(200).json({
      success: true,
      message: 'Admin profile retrieved successfully',
      admin: {
        email: decoded.email,
        role: decoded.role,
        loginTime: new Date(decoded.iat * 1000).toISOString(),
        expiresAt: new Date(decoded.exp * 1000).toISOString()
      }
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      message: 'Please login again'
    });
  }
};

module.exports = {
  adminLogin,
  validateToken,
  getAdminProfile
};