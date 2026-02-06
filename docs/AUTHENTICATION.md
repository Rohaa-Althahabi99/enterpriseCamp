# Admin Authentication System

This document describes the admin authentication endpoints implemented based on the **UC-001 - Admin Authentication** use case.

## Overview

The authentication system provides secure admin login functionality using JWT tokens. It implements comprehensive logging, rate limiting, and follows the security requirements specified in the use case document.

## Environment Configuration

Ensure these environment variables are set in your `.env` file:

```env
# Admin Authentication
ADMIN_EMAIL=admin@lesone.com
ADMIN_PASSWORD=admin123

# JWT Configuration  
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Database and other configs...
```

> **Note**: In production, consider hashing the `ADMIN_PASSWORD` using bcrypt.

## Available Endpoints

### 1. Admin Login

**POST** `/api/v1/auth/login`

Authenticates admin user and returns JWT token.

**Request Body:**
```json
{
  "email": "admin@lesone.com",
  "password": "admin123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d",
  "admin": {
    "email": "admin@lesone.com",
    "role": "admin"
  }
}
```

**Error Responses:**
- `400` - Missing email or password
- `401` - Invalid credentials
- `429` - Too many attempts (rate limited)
- `500` - System configuration error

### 2. Token Validation

**GET** `/api/v1/auth/validate`

Validates JWT token and returns admin information.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token is valid",
  "admin": {
    "email": "admin@lesone.com",
    "role": "admin"
  },
  "expiresAt": "2026-02-13T10:30:00.000Z"
}
```

### 3. Admin Profile

**GET** `/api/v1/auth/profile`

Returns current admin profile information.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Admin profile retrieved successfully",
  "admin": {
    "email": "admin@lesone.com",
    "role": "admin",
    "loginTime": "2026-02-06T10:30:00.000Z",
    "expiresAt": "2026-02-13T10:30:00.000Z"
  }
}
```

### 4. Admin Logout

**POST** `/api/v1/auth/logout`

Provides logout confirmation. Token invalidation is handled client-side.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logout successful. Please remove token from client storage.",
  "timestamp": "2026-02-06T10:30:00.000Z"
}
```

## Protected Admin Routes

Example protected routes using the authentication middleware:

### Admin Dashboard

**GET** `/api/v1/admin/dashboard`

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "admin": {
      "email": "admin@lesone.com",
      "role": "admin"
    },
    "statistics": {
      "totalUsers": 150,
      "totalRequests": 1200,
      "totalUserTypes": 8
    },
    "navigation": [
      {"name": "User Types Management", "path": "/admin/user-types"},
      {"name": "Requests Management", "path": "/admin/requests"}
    ]
  }
}
```

## Security Features

### Rate Limiting
- **Limit**: 5 login attempts per IP address
- **Window**: 15 minutes
- **Response**: 429 status with retry-after time

### Logging
All authentication events are logged with:
- Timestamp
- IP address
- User agent
- Action (success/failure)
- Reason for failure
- Session duration

### JWT Security
- Configurable expiration (default: 7 days)
- Secure secret key
- Admin email and role in payload
- Issued-at timestamp

## Usage Examples

### Frontend Login Flow

```javascript
// Login request
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@lesone.com',
    password: 'admin123'
  })
});

const data = await response.json();

if (data.success) {
  // Store token in localStorage
  localStorage.setItem('adminToken', data.token);
  
  // Redirect to dashboard
  window.location.href = '/admin/dashboard';
}
```

### Making Authenticated Requests

```javascript
// Get stored token
const token = localStorage.getItem('adminToken');

// Make authenticated request
const response = await fetch('/api/v1/admin/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Using Authentication Middleware

```javascript
const { authenticateAdmin, requireAdminRole } = require('../shared/middleware/auth');

// Protect a route
router.get('/protected-route', authenticateAdmin, requireAdminRole, (req, res) => {
  // req.admin contains authenticated admin info
  console.log('Admin email:', req.admin.email);
  console.log('Admin role:', req.admin.role);
  
  res.json({ message: 'Access granted' });
});
```

## Error Handling

The system provides detailed error responses:

```json
{
  "success": false,
  "error": "Invalid credentials",
  "message": "Please check your email and password"
}
```

Common error types:
- `Invalid credentials` - Wrong email or password
- `Token expired` - JWT token has expired
- `Invalid token` - Malformed JWT token
- `Access denied` - No token provided
- `Too many attempts` - Rate limit exceeded
- `System configuration error` - Missing environment variables

## Testing

### Valid Login Test
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lesone.com","password":"admin123"}'
```

### Token Validation Test
```bash
curl -X GET http://localhost:3000/api/v1/auth/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Protected Route Test
```bash
curl -X GET http://localhost:3000/api/v1/admin/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Architecture

The authentication system follows this structure:

```
src/features/auth/
├── controllers.js    # Authentication logic
├── router.js        # Route definitions and Swagger docs
└── index.js         # Module exports

src/shared/middleware/
└── auth.js          # Authentication middleware

src/features/admin/
├── router.js        # Protected admin routes example
└── index.js         # Module exports
```

## Related Documentation

- [Use Case UC-001: Admin Authentication](../documents/UseCases/adminLoginUseCase.md)
- [API Documentation](http://localhost:3000/api-docs) (when server is running)
- [System Architecture](../documents/mindset.txt)

---

This authentication system implements all requirements from the **UC-001 Admin Authentication** use case, including security measures, comprehensive logging, rate limiting, and proper error handling.