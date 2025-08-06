import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const router = Router();

// AuthService will be injected from index.ts
let authService: AuthService;

export function setAuthService(service: AuthService) {
  authService = service;
}

/**
 * POST /api/auth/login
 * Authenticates user with QuickFlora API and creates a session
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeID, companyID, employeePassword } = req.body;

    // Validate required fields
    if (!employeeID || !companyID || !employeePassword) {
      res.status(400).json({
        error: true,
        message: 'Missing required fields: employeeID, companyID, employeePassword',
        code: 'MISSING_FIELDS'
      });
      return;
    }

    // Attempt login
    const result = await authService.login({
      employeeID,
      companyID,
      employeePassword,
    });

    res.json({
      error: false,
      message: result.message,
      data: {
        sessionId: result.sessionId,
        userId: result.userId,
        companyId: result.companyId,
      }
    });

  } catch (error) {
    console.error('❌ Login route error:', error);
    
    if (error instanceof Error) {
      res.status(401).json({
        error: true,
        message: error.message,
        code: 'LOGIN_FAILED'
      });
      return;
    }

    res.status(500).json({
      error: true,
      message: 'Internal server error during login',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logs out user by removing their session
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(400).json({
        error: true,
        message: 'Session token required for logout',
        code: 'MISSING_SESSION_TOKEN'
      });
      return;
    }

    const loggedOut = await authService.logoutFromQuickFlora(sessionToken);

    if (loggedOut) {
      res.json({
        error: false,
        message: 'Logout successful',
        data: { loggedOut: true }
      });
    } else {
      res.status(404).json({
        error: true,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

  } catch (error) {
    console.error('❌ Logout route error:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error during logout',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/auth/session
 * Validates current session and returns user info
 */
router.get('/session', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(401).json({
        error: true,
        message: 'Session token required',
        code: 'MISSING_SESSION_TOKEN'
      });
      return;
    }

    const session = authService.getSession(sessionToken);

    if (!session) {
      res.status(401).json({
        error: true,
        message: 'Invalid or expired session',
        code: 'INVALID_SESSION'
      });
      return;
    }

    // Check if QuickFlora session is still valid
    const isQuickFloraValid = await authService.checkQuickFloraSessionStatus(sessionToken);
    
    if (!isQuickFloraValid) {
      // Remove invalid session
      authService.logout(sessionToken);
      res.status(401).json({
        error: true,
        message: 'QuickFlora session expired',
        code: 'QUICKFLORA_SESSION_EXPIRED'
      });
      return;
    }

    // Get token expiration info
    const expirationInfo = authService.getTokenExpirationInfo(sessionToken);

    res.json({
      error: false,
      message: 'Session valid',
      data: {
        userId: session.userId,
        companyId: session.companyId,
        employeeId: session.employeeId,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        tokenExpiry: session.tokenExpiry,
        quickFloraValid: isQuickFloraValid,
        expirationInfo: expirationInfo ? {
          expiresAt: expirationInfo.expiresAt,
          timeUntilExpiry: expirationInfo.timeUntilExpiry,
          isExpiringSoon: expirationInfo.isExpiringSoon,
          isExpired: expirationInfo.isExpired,
          minutesUntilExpiry: Math.round(expirationInfo.timeUntilExpiry / 1000 / 60)
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Session validation error:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error during session validation',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refreshes session silently using stored credentials
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      res.status(400).json({
        error: true,
        message: 'Session token required for refresh',
        code: 'MISSING_SESSION_TOKEN'
      });
      return;
    }

    const refreshResult = await authService.refreshSessionSilently(sessionToken);

    if (refreshResult.success) {
      res.json({
        error: false,
        message: 'Session refreshed successfully',
        data: {
          newSessionId: refreshResult.newSessionId,
          refreshed: true
        }
      });
    } else {
      res.status(401).json({
        error: true,
        message: refreshResult.error || 'Session refresh failed',
        code: 'REFRESH_FAILED'
      });
    }

  } catch (error) {
    console.error('❌ Session refresh error:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error during session refresh',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/auth/stats
 * Returns session statistics (for monitoring)
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = authService.getSessionStats();
    
    res.json({
      error: false,
      message: 'Session statistics retrieved',
      data: stats
    });

  } catch (error) {
    console.error('❌ Stats route error:', error);
    res.status(500).json({
      error: true,
      message: 'Internal server error while retrieving stats',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router; 