import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { User } from '../models/User';

interface AuthenticatedRequest extends Request {
  user?: any;
  userId?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { message: 'No token provided' },
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: { message: 'No token provided' },
      });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { userId: string };
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user || user.isAnonymous) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid token' },
      });
      return;
    }

    req.user = user;
    req.userId = user._id.toString();
    
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        details: (error as Error).message,
      },
    });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { userId: string };
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user && !user.isAnonymous) {
          req.user = user;
          req.userId = user._id.toString();
        }
      }
    }
    
    next();
  } catch (error) {
    // For optional auth, we continue even if token is invalid
    next();
  }
};

export { AuthenticatedRequest };
