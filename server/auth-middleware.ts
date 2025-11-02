import { Request, Response, NextFunction } from "express";
import { InviteAuthService } from "./invite-auth-service";

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    username: string;
    role: string;
  };
}

/**
 * Authentication middleware
 * Checks for JWT token in Authorization header or cookies
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Check cookies if no header token
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      console.log(`[AUTH] Token not found for ${req.method} ${req.path}`, {
        hasCookies: !!req.cookies,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : 'none',
        allHeaders: Object.keys(req.headers)
      });
      res.status(401).json({
        success: false,
        message: "Access token required"
      });
      return;
    }

    // Verify token
    let decoded;
    try {
      decoded = InviteAuthService.verifyToken(token);
    } catch (error) {
      res.status(401).json({ 
        success: false, 
        message: "Invalid or expired token" 
      });
      return;
    }

    // Get user details
    const user = await InviteAuthService.getUserById(decoded.id);
    if (!user) {
      res.status(401).json({ 
        success: false, 
        message: "User not found" 
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.email, // Use email as username
      role: user.role
    };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ 
      success: false, 
      message: "Authentication failed" 
    });
  }
};

/**
 * Optional authentication middleware
 * Checks for token but doesn't require it
 */
export const optionalAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Check cookies if no header token
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        // Verify token
        const decoded = InviteAuthService.verifyToken(token);
        if (decoded) {
          // Get user details
          const user = await InviteAuthService.getUserById(decoded.id);
          if (user) {
            req.user = {
              id: user.id,
              email: user.email,
              username: user.email,
              role: user.role
            };
          }
        }
      } catch (error) {
        // Token is invalid, continue without authentication
        console.log("Optional auth - invalid token, continuing without auth");
      }
    }

    next();
  } catch (error) {
    console.error("Optional authentication error:", error);
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
      return;
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ 
        success: false, 
        message: "Insufficient permissions" 
      });
      return;
    }

    next();
  };
};

/**
 * Check if user is authenticated (for API responses)
 */
export const isAuthenticated = (req: Request): boolean => {
  return !!req.user;
};

/**
 * Get current user from request
 */
export const getCurrentUser = (req: Request): any => {
  return req.user;
};