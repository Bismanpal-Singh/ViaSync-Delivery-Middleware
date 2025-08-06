import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';

// Extend Request interface to include user context
declare global {
  namespace Express {
    interface Request {
      user?: {
        sessionId: string;
        userId: string;
        companyId: string;
        employeeId: string;
      };
    }
  }
}

/**
 * Authentication middleware that validates user sessions.
 * Extracts session token from headers and validates with AuthService.
 */
export function authenticateUser(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('🔐 Authentication middleware called');
      console.log('📋 Request headers:', Object.keys(req.headers));
      
      // Get session token from headers
      const sessionToken = req.headers['x-session-token'] as string;
      
      console.log('🎫 Session token received:', sessionToken ? `${sessionToken.substring(0, 10)}...` : 'NOT FOUND');
      
      if (!sessionToken) {
        console.log('❌ No session token provided');
        res.status(401).json({
          error: true,
          message: 'Session token required',
          code: 'MISSING_SESSION_TOKEN'
        });
        return;
      }

      // Validate session
      console.log('🔍 Validating session token...');
      
      // Debug: Check available sessions
      const sessionStats = authService.getSessionStats();
      console.log('📊 Available sessions:', sessionStats);
      
      const session = authService.getSession(sessionToken);
      
      console.log('📊 Session validation result:', session ? 'FOUND' : 'NOT FOUND');
      
      if (!session) {
        console.log('❌ Session validation failed');
        res.status(401).json({
          error: true,
          message: 'Invalid or expired session',
          code: 'INVALID_SESSION'
        });
        return;
      }

      // Add user context to request
      req.user = {
        sessionId: session.sessionId,
        userId: session.userId,
        companyId: session.companyId,
        employeeId: session.employeeId,
      };

      console.log(`🔐 Authenticated user: ${session.userId} (${session.companyId})`);
      next();
    } catch (error) {
      console.error('❌ Authentication error:', error);
      res.status(401).json({
        error: true,
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
      return;
    }
  };
}

/**
 * Optional authentication middleware - doesn't fail if no session provided.
 * Useful for endpoints that can work with or without authentication.
 */
export function optionalAuth(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      
      if (sessionToken) {
        const session = authService.getSession(sessionToken);
        
        if (session) {
          req.user = {
            sessionId: session.sessionId,
            userId: session.userId,
            companyId: session.companyId,
            employeeId: session.employeeId,
          };
          console.log(`🔐 Optional auth - user: ${session.userId} (${session.companyId})`);
        }
      }
      
      next();
    } catch (error) {
      console.error('❌ Optional authentication error:', error);
      // Continue without authentication
      next();
    }
  };
} 