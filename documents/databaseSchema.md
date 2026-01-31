# Database Schema Documentation

## Overview
This database schema is designed for a dynamic user request management system where admins can create different user types with customizable fields, and users can submit requests based on their selected user type.

## Database Design Philosophy
- **Dynamic Field System**: Uses a flexible approach with `fields_master` and `user_type_fields` tables to allow admins to create custom user types without code changes
- **JSONB Storage**: User request data is stored in JSONB format for flexibility and performance
- **No Dynamic Tables**: Instead of creating new tables for each user type, all data is stored in the `requests` table
- **Admin in Environment**: Admin credentials are stored in environment variables for security

## Tables Structure

### 1. fields_master
Stores all possible fields that can be used across different user types.

```sql
CREATE TABLE fields_master (
    id SERIAL PRIMARY KEY,
    field_name VARCHAR(50) NOT NULL UNIQUE,
    field_label VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'email', 'tel', 'number', 'dropdown', 'textarea')),
    field_options JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Contains all available fields that can be assigned to user types
- `field_name`: Internal field identifier (e.g., 'email', 'phone', 'student_id')
- `field_label`: Display label for the field (e.g., 'البريد الإلكتروني', 'رقم الهاتف')
- `field_type`: HTML input type for proper form rendering
- `field_options`: JSON array for dropdown options (e.g., ["CS", "Engineering", "Medicine"])

### 2. user_types
Stores different types of users in the system.

```sql
CREATE TABLE user_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Defines available user categories
- `type_name`: Name of the user type (e.g., 'student', 'agent', 'teacher')
- `is_active`: Whether this user type is available for new requests

### 3. user_type_fields
Junction table linking user types to their required fields.

```sql
CREATE TABLE user_type_fields (
    id SERIAL PRIMARY KEY,
    user_type_id INTEGER NOT NULL REFERENCES user_types(id) ON DELETE CASCADE,
    field_id INTEGER NOT NULL REFERENCES fields_master(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT false,
    field_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_type_id, field_id)
);
```

**Purpose**: Defines which fields are shown for each user type and their properties
- `is_required`: Whether the field is mandatory for this user type
- `field_order`: Display order of fields in the form
- Unique constraint prevents duplicate field assignments

### 4. requests
Stores all user requests with flexible JSONB data storage.

```sql
CREATE TABLE requests (
    id SERIAL PRIMARY KEY,
    user_type_id INTEGER NOT NULL REFERENCES user_types(id),
    data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);
```

**Purpose**: Stores all user requests regardless of user type
- `data`: JSONB field containing all form data submitted by the user
- `status`: Current request status (pending/approved/rejected)
- `admin_notes`: Optional notes added by admin when processing the request
- `processed_at`: Timestamp when status was changed from pending

## Indexes for Performance

### Primary Indexes for Core Operations

```sql
-- User Types Indexes
CREATE INDEX idx_user_types_active ON user_types(is_active) WHERE is_active = true;
CREATE INDEX idx_user_types_name ON user_types(type_name);

-- User Type Fields Indexes
CREATE INDEX idx_user_type_fields_type ON user_type_fields(user_type_id);
CREATE INDEX idx_user_type_fields_order ON user_type_fields(user_type_id, field_order);
CREATE INDEX idx_user_type_fields_required ON user_type_fields(user_type_id, is_required);

-- Fields Master Indexes
CREATE INDEX idx_fields_master_name ON fields_master(field_name);
CREATE INDEX idx_fields_master_type ON fields_master(field_type);
```

### Request Management Indexes

```sql
-- Basic request indexes
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_user_type ON requests(user_type_id);
CREATE INDEX idx_requests_created_at ON requests(created_at);
CREATE INDEX idx_requests_updated_at ON requests(updated_at);
CREATE INDEX idx_requests_processed_at ON requests(processed_at);

-- Composite indexes for admin dashboard queries
CREATE INDEX idx_requests_status_created ON requests(status, created_at DESC);
CREATE INDEX idx_requests_user_type_status ON requests(user_type_id, status);
CREATE INDEX idx_requests_status_processed ON requests(status, processed_at DESC) WHERE processed_at IS NOT NULL;

-- Partial indexes for better performance
CREATE INDEX idx_requests_pending ON requests(created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_requests_approved ON requests(processed_at DESC) WHERE status = 'approved';
CREATE INDEX idx_requests_rejected ON requests(processed_at DESC) WHERE status = 'rejected';
```

### JSONB Indexes for Flexible Data Queries

```sql
-- General JSONB index for all data searches
CREATE INDEX idx_requests_data_gin ON requests USING GIN(data);

-- Specific JSONB path indexes for common searches
CREATE INDEX idx_requests_email ON requests USING GIN((data->>'email'));
CREATE INDEX idx_requests_name ON requests USING GIN((data->>'name'));
CREATE INDEX idx_requests_phone ON requests USING GIN((data->>'phone'));

-- Expression indexes for case-insensitive searches
CREATE INDEX idx_requests_email_lower ON requests(LOWER(data->>'email'));
CREATE INDEX idx_requests_name_lower ON requests(LOWER(data->>'name'));

-- Indexes for student-specific searches
CREATE INDEX idx_requests_student_id ON requests((data->>'student_id')) WHERE user_type_id = 1;

-- Indexes for agent-specific searches  
CREATE INDEX idx_requests_license_number ON requests((data->>'license_number')) WHERE user_type_id = 2;
```

### Advanced Performance Indexes

```sql
-- Covering indexes to avoid table lookups
CREATE INDEX idx_requests_dashboard_covering ON requests(status, created_at DESC) 
INCLUDE (id, user_type_id, admin_notes, processed_at);

-- Multi-column indexes for complex admin queries
CREATE INDEX idx_requests_admin_filter ON requests(user_type_id, status, created_at DESC, updated_at);

-- Index for counting requests by type and status
CREATE INDEX idx_requests_stats ON requests(user_type_id, status);

-- Index for recent activity queries
CREATE INDEX idx_requests_recent_activity ON requests(updated_at DESC) 
WHERE updated_at > (CURRENT_TIMESTAMP - INTERVAL '30 days');
```

### Index Usage Guidelines

#### When to Use Each Index Type:

1. **B-tree Indexes** (default): 
   - Equality and range queries
   - Sorting operations
   - Primary and foreign key lookups

2. **GIN Indexes**: 
   - JSONB data searches
   - Full-text search
   - Array operations

3. **Partial Indexes**: 
   - When you frequently query a subset of data
   - Reduces index size and maintenance overhead
   - Better for skewed data distributions

4. **Composite Indexes**: 
   - Multi-column WHERE clauses
   - Sorting by multiple columns
   - Covering indexes to avoid table access

#### Query Performance Examples:

```sql
-- Fast with idx_requests_pending
SELECT * FROM requests 
WHERE status = 'pending' 
ORDER BY created_at DESC;

-- Fast with idx_requests_email_lower
SELECT * FROM requests 
WHERE LOWER(data->>'email') = 'user@example.com';

-- Fast with idx_requests_user_type_status
SELECT COUNT(*) FROM requests 
WHERE user_type_id = 1 AND status = 'approved';

-- Fast with idx_requests_dashboard_covering
SELECT id, user_type_id, admin_notes, processed_at 
FROM requests 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Index Maintenance

```sql
-- Monitor index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public';

-- Find unused indexes
SELECT 
    schemaname,
    tablename,
    indexname
FROM pg_stat_user_indexes 
WHERE idx_scan = 0 
AND schemaname = 'public';

-- Reindex for maintenance (run periodically)
REINDEX INDEX CONCURRENTLY idx_requests_data_gin;
REINDEX INDEX CONCURRENTLY idx_requests_status_created;
```

### Performance Considerations

1. **Index Size vs Query Speed**: Balance between index maintenance overhead and query performance
2. **Write Performance**: Too many indexes can slow down INSERT/UPDATE operations
3. **Index Selectivity**: Create indexes on columns with high selectivity (many unique values)
4. **Partial Indexes**: Use for skewed data to reduce index size
5. **JSONB Indexing**: GIN indexes are powerful but can be large - use specific path indexes when possible

## Sample Data

### fields_master Sample Data
```sql
INSERT INTO fields_master (field_name, field_label, field_type, field_options) VALUES
('name', 'الاسم الكامل', 'text', null),
('email', 'البريد الإلكتروني', 'email', null),
('phone', 'رقم الهاتف', 'tel', null),
('student_id', 'الرقم الجامعي', 'text', null),
('license_number', 'رقم الرخصة', 'text', null),
('company', 'الشركة', 'text', null),
('course', 'التخصص', 'dropdown', '["CS", "Engineering", "Medicine", "Business"]'),
('experience', 'سنوات الخبرة', 'number', null),
('address', 'العنوان', 'textarea', null);
```

### user_types Sample Data
```sql
INSERT INTO user_types (type_name) VALUES
('student'),
('agent'),
('teacher');
```

### user_type_fields Sample Data
```sql
-- Student fields
INSERT INTO user_type_fields (user_type_id, field_id, is_required, field_order) VALUES
(1, 1, true, 1),   -- name (required)
(1, 2, true, 2),   -- email (required)
(1, 3, false, 3),  -- phone (optional)
(1, 4, true, 4),   -- student_id (required)
(1, 7, true, 5);   -- course (required)

-- Agent fields
INSERT INTO user_type_fields (user_type_id, field_id, is_required, field_order) VALUES
(2, 1, true, 1),   -- name (required)
(2, 2, true, 2),   -- email (required)
(2, 3, true, 3),   -- phone (required)
(2, 5, true, 4),   -- license_number (required)
(2, 6, false, 5),  -- company (optional)
(2, 8, true, 6);   -- experience (required)

-- Teacher fields
INSERT INTO user_type_fields (user_type_id, field_id, is_required, field_order) VALUES
(3, 1, true, 1),   -- name (required)
(3, 2, true, 2),   -- email (required)
(3, 3, true, 3),   -- phone (required)
(3, 7, true, 4),   -- course (required)
(3, 8, true, 5);   -- experience (required)
```

### requests Sample Data
```sql
INSERT INTO requests (user_type_id, data, status, admin_notes) VALUES
(1, '{"name": "أحمد محمد", "email": "ahmed@mail.com", "phone": "0501234567", "student_id": "STU001", "course": "CS"}', 'approved', 'مرحباً بك في النظام'),
(2, '{"name": "سارة أحمد", "email": "sara@mail.com", "phone": "0509876543", "license_number": "AG001", "company": "شركة التطوير", "experience": 5}', 'pending', null),
(1, '{"name": "خالد علي", "email": "khaled@mail.com", "student_id": "STU002", "course": "Engineering"}', 'rejected', 'بيانات ناقصة - يرجى إضافة رقم الهاتف');
```

## Data Flow Examples

### 1. User Creating a Request
1. Frontend calls `GET /api/v1/user-types` → Gets available user types
2. User selects "student" (id: 1)
3. Frontend calls `GET /api/v1/user-types/1/fields` → Gets required fields for student
4. User fills form and submits data
5. Backend stores in `requests` table with JSONB data

### 2. Admin Creating New User Type
1. Admin calls `GET /api/v1/fields-master` → Gets all available fields
2. Admin selects fields and creates "contractor" user type
3. Backend inserts into `user_types` and `user_type_fields` tables
4. New user type becomes available for user requests

### 3. Admin Processing Request
1. Admin views pending requests
2. Admin approves/rejects with optional notes
3. Backend updates `status`, `admin_notes`, and `processed_at`
4. Notification sent to user

## Environment Configuration

Admin credentials are stored in environment variables for security:

```env
# Admin Authentication
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=$2b$10$...

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Notification Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@yourdomain.com
SMTP_PASS=app_password
```

## Data Validation Rules

### Field Validation
- `email` fields: Must match email regex pattern
- `tel` fields: Must match phone number format
- `number` fields: Must be numeric and within specified range
- `dropdown` fields: Must be one of the predefined options

### Request Validation
- All required fields for the user type must be present
- Field values must match their defined types
- JSONB data size limit: 10MB per request

## Security Considerations

1. **Input Sanitization**: All user input is sanitized before storage
2. **SQL Injection Prevention**: Using parameterized queries and Prisma ORM
3. **Admin Authentication**: Secure password hashing with bcrypt
4. **Rate Limiting**: API endpoints have rate limiting to prevent abuse
5. **CORS Configuration**: Proper CORS setup for frontend-backend communication

## Backup and Maintenance

### Automated Backups
- Daily backups at 2:00 AM using pg_dump
- Backups stored in compressed format (.sql.gz)
- Old backups (>30 days) automatically deleted
- Backup files excluded from version control

### Maintenance Queries
```sql
-- Clean up old rejected requests (older than 6 months)
DELETE FROM requests 
WHERE status = 'rejected' 
AND created_at < NOW() - INTERVAL '6 months';

-- Update field order for better UX
UPDATE user_type_fields 
SET field_order = field_order + 1 
WHERE user_type_id = 1 AND field_order >= 3;

-- Reactivate inactive user types
UPDATE user_types 
SET is_active = true, updated_at = CURRENT_TIMESTAMP 
WHERE type_name = 'teacher';
```

## Performance Optimization

1. **JSONB Indexing**: GIN indexes on JSONB columns for fast queries
2. **Partial Indexes**: Index only active user types and pending requests
3. **Connection Pooling**: Use connection pooling for database connections
4. **Query Optimization**: Efficient joins and proper WHERE clauses
5. **Caching**: Redis caching for frequently accessed user types and fields

## Migration Scripts

### Initial Setup
```sql
-- Create database
CREATE DATABASE request_management_system;

-- Create tables (run the CREATE TABLE statements above)

-- Insert initial data (run the INSERT statements above)

-- Create indexes (run the CREATE INDEX statements above)
```

### Future Migrations
- Version control for database schema changes
- Rolling updates without downtime
- Data migration scripts for structural changes
- Rollback procedures for failed migrations
