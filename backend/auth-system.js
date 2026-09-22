// Comprehensive Authentication and Authorization System
// ==========================================

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://yucoydfekjmbiinvfhzg.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
);

// JWT Secret - should come from environment variables in production
const JWT_SECRET = process.env.JWT_SECRET || 'ndg-development-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ==================== JWT AUTHENTICATION ===================
class JWTAuthentication {
  static async validateToken(token) {
    try {
      if (!token || !token.startsWith('Bearer ')) {
        return { valid: false, error: 'Missing or invalid Authorization header' };
      }

      const tokenValue = token.slice(7);
      const decoded = jwt.verify(tokenValue, JWT_SECRET);

      // Fetch user profile from Supabase
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, auth_user_id, email, role_key, name, must_change_password, email_verified, phone_verified, kyc_status, last_login')
        .eq('auth_user_id', decoded.userId)
        .single();

      if (profileError || !profile) {
        return { valid: false, error: 'User not found or not registered in portal' };
      }

      // Check email verification for sensitive operations
      if (!profile.email_verified) {
        return {
          valid: false,
          error: 'Email verification required for access',
          requiresVerification: true
        };
      }

      // Check password change requirement
      if (profile.must_change_password) {
        return {
          valid: false,
          error: 'Password change required',
          code: 'PASSWORD_CHANGE_REQUIRED'
        };
      }

      return { valid: true, user: decoded, profile };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token expired', code: 'TOKEN_EXPIRED' };
      }
      return { valid: false, error: 'Invalid token' };
    }
  }

  static generateToken(userId, email, roleKey) {
    return jwt.sign(
      {
        userId,
        email,
        roleKey,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (JWT_EXPIRES_IN.endsWith('h') ?
          parseInt(JWT_EXPIRES_IN) * 3600 : 86400)
      },
      JWT_SECRET
    );
  }
}

// ==================== PERMISSION SYSTEM ===================
class PermissionSystem {
  static LEVEL_ORDER = { '—': 0, 'View': 1, 'Self': 2, 'Submits': 3, 'Own': 4, 'Manage': 5, 'Full': 6 };

  static canAccess(level, action) {
    const thresholds = { list: 1, create: 3, update: 4, delete: 6 };
    return this.LEVEL_ORDER[level] >= (thresholds[action] ?? 0);
  }

  static async getAccessLevel(roleKey, moduleKey) {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('access_level')
      .eq('role_key', roleKey)
      .eq('module_key', moduleKey)
      .single();
    if (error || !data) return null;
    return data.access_level;
  }

  static async getUserSpecificAccessLevel(userId, moduleKey) {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('access_level')
      .eq('user_id', userId)
      .eq('module_key', moduleKey)
      .single();
    if (error || !data) return null;
    return data.access_level;
  }

  static async getUserOverrideAccessLevel(userId, moduleKey) {
    const { data, error } = await supabase
      .from('user_overrides')
      .select('access_level')
      .eq('user_id', userId)
      .eq('module_key', moduleKey)
      .single();
    if (error || !data) return null;
    return data.access_level;
  }

  static async enforcePermission(req, res, next, moduleKey, action) {
    try {
      // First check user-level overrides (highest priority)
      let userAccessLevel = null;

      // Check for explicit user permission override (bypasses role checks)
      userAccessLevel = await this.getUserOverrideAccessLevel(req.auth.profile.id, moduleKey);
      if (userAccessLevel) {
        if (this.canAccess(userAccessLevel, action)) {
          req.userOverrideActive = true;
          req.overrideAccessLevel = userAccessLevel;
          next();
          return;
        }
      }

      // Check for user-specific access level (grants access without role restrictions)
      userAccessLevel = await this.getUserSpecificAccessLevel(req.auth.profile.id, moduleKey);
      if (userAccessLevel) {
        if (this.canAccess(userAccessLevel, action)) {
          req.userSpecificAccess = true;
          req.userAccessLevel = userAccessLevel;
          next();
          return;
        }
      }

      // Fall back to role-based access
      const roleAccessLevel = await this.getAccessLevel(req.auth.profile.role_key, moduleKey);

      if (!roleAccessLevel) {
        return res.status(403).json({ error: 'Access denied - module not assigned to your role' });
      }

      // Check if user has permission for the action
      if (!this.canAccess(roleAccessLevel, action)) {
        return res.status(403).json({
          error: `Access denied - insufficient ${action} permissions`,
          requiredLevel: action,
          yourLevel: roleAccessLevel,
          accessDeniedBy: userAccessLevel ? 'user_override' : userAccessLevel ? 'user_specific' : 'role_based'
        });
      }

      next();
    } catch (error) {
      console.error('Permission enforcement error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  }

  static async enforceSuperAdmin(req, res, next) {
    // Check user-level super admin override first
    const userOverrideAccessLevel = await this.getUserOverrideAccessLevel(req.auth.profile.id, 'super_admin_endpoints');
    if (userOverrideAccessLevel && this.canAccess(userOverrideAccessLevel, 'delete')) {
      req.userOverrideSuperAdmin = true;
      next();
      return;
    }

    if (req.auth.profile.role_key !== 'super_admin') {
      return res.status(403).json({
        error: 'Access denied - super_admin role required',
        requiredRole: 'super_admin',
        yourRole: req.auth.profile.role_key,
        accessDeniedBy: 'role_based'
      });
    }
    next();
  }

  static getModuleFromPath(path) {
    const pathMap = {
      'users': 'users',
      'curriculum': 'curriculum',
      'batches': 'batches',
      'timetable': 'timetable',
      'liveclasses': 'liveclasses',
      'lessonplans': 'lessonplans',
      'assignments': 'assignments',
      'feedback': 'feedback',
      'events': 'events',
      'jobs': 'jobs',
      'enquiries': 'enquiries',
      'activities': 'activities',
      'courses': 'curriculum',
      'course_modules': 'curriculum',
      'course_module_topics': 'curriculum',
      'examination_types': 'curriculum',
      'program_categories': 'curriculum',
      'course_syllabi': 'curriculum',
      'timetable_periods': 'timetable',
      'roles': 'roles',
      'role_permissions': 'roles',
      'class_entries': 'teachinglogs',
      'class_confirmations': 'teachinglogs',
      'assignment_submissions': 'assignments',
      'projects': 'projects',
      'certificates': 'certificates'
    };

    // Extract module key from path
    if (path.startsWith('/api/users')) return 'users';
    if (path.startsWith('/api/curriculum')) return 'curriculum';
    if (path.startsWith('/api/batches')) return 'batches';
    if (path.startsWith('/api/timetable')) return 'timetable';
    if (path.startsWith('/api/liveclasses')) return 'liveclasses';
    if (path.startsWith('/api/lessonplans')) return 'lessonplans';
    if (path.startsWith('/api/assignments')) return 'assignments';
    if (path.startsWith('/api/feedback')) return 'feedback';
    if (path.startsWith('/api/events')) return 'events';
    if (path.startsWith('/api/jobs')) return 'jobs';
    if (path.startsWith('/api/enquiries')) return 'enquiries';
    if (path.startsWith('/api/activities')) return 'activities';
    if (path.startsWith('/api/courses')) return 'curriculum';
    if (path.startsWith('/api/course_modules')) return 'curriculum';
    if (path.startsWith('/api/course_module_topics')) return 'curriculum';
    if (path.startsWith('/api/examination_types')) return 'curriculum';
    if (path.startsWith('/api/program_categories')) return 'curriculum';
    if (path.startsWith('/api/course_syllabi')) return 'curriculum';
    if (path.startsWith('/api/timetable_periods')) return 'timetable';
    if (path.startsWith('/api/roles')) return 'roles';
    if (path.startsWith('/api/role_permissions')) return 'roles';
    if (path.startsWith('/api/class_entries')) return 'teachinglogs';
    if (path.startsWith('/api/class_confirmations')) return 'teachinglogs';
    if (path.startsWith('/api/assignment_submissions')) return 'assignments';
    if (path.startsWith('/api/projects')) return 'projects';
    if (path.startsWith('/api/certificates')) return 'certificates';

    return null;
  }
}

// ==================== AUTH MIDDLEWARE ===================
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch the user's role from public.users — match by auth_user_id
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('role_key, id, name, email, must_change_password, email_verified, phone_verified, kyc_status')
      .eq('auth_user_id', user.id)
      .single();

    if (profileErr || !profile) {
      return res.status(403).json({ error: 'User not registered in portal' });
    }

    // Force password change gate — allow only OTP/password-change + health/cms reads
    if (profile.must_change_password) {
      const allow = (
        req.path.startsWith('/api/auth/') ||
        req.path === '/health' || req.path === '/api/health' ||
        (req.method === 'GET' && req.path.startsWith('/api/cms'))
      );
      if (!allow) return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    // Enhanced email verification check for sensitive operations
    if (!profile.email_verified && (
        req.path.startsWith('/api/admin/') ||
        req.path.startsWith('/api/users') && (req.method === 'PUT' || req.method === 'DELETE') ||
        req.path.startsWith('/api/curriculum') && req.method !== 'GET' ||
        req.path.startsWith('/api/batches') && req.method !== 'GET' ||
        req.path.startsWith('/api/timetable') && req.method !== 'GET'
      )) {
      return res.status(403).json({ error: 'Email verification required for sensitive operations' });
    }

    req.auth = { user, profile };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Auth verification failed' });
  }
}

// ==================== USER PERMISSIONS SCHEMA ===================
const USER_PERMISSIONS_SCHEMA = {
  table: 'user_permissions',
  columns: ['id', 'user_id', 'module_key', 'access_level'],
  description: 'Individual user permissions - grants access to specific modules'
};

const USER_OVERRIDES_SCHEMA = {
  table: 'user_overrides',
  columns: ['id', 'user_id', 'module_key', 'access_level'],
  description: 'User permission overrides - bypass role restrictions, highest priority'
};

// ==================== EXPORTS ===================
module.exports = {
  JWTAuthentication,
  PermissionSystem,
  authMiddleware,
  USER_PERMISSIONS_SCHEMA,
  USER_OVERRIDES_SCHEMA
};

console.log('✅ Authentication system loaded successfully');
console.log('- JWT authentication with role-based access control');
console.log('- Enhanced email verification and password change requirements');
console.log('- Super Admin protection for admin endpoints');
console.log('- Comprehensive permission enforcement system');