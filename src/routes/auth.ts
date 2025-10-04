import express, { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User';
import { Questionnaire } from '../models/Questionnaire';

const router = express.Router();

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Generate JWT token
const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

// Register route
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'Email and password are required' },
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters long' },
      });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && !existingUser.isAnonymous) {
      res.status(400).json({
        success: false,
        error: { message: 'User already exists with this email' },
      });
      return;
    }

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      isAnonymous: false,
      isEmailVerified: false,
      subscriptions: [],
      transactions: [],
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id.toString());

    // Return user data without password
    const userResponse = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };

    res.status(201).json({
      success: true,
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to register user',
        details: (error as Error).message,
      },
    });
  }
});

// Login route
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { message: 'Email and password are required' },
      });
      return;
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.isAnonymous) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' },
      });
      return;
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' },
      });
      return;
    }

    // Update last active
    user.lastActiveAt = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id.toString());

    // Return user data without password
    const userResponse = {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      isEmailVerified: user.isEmailVerified,
      subscriptions: user.subscriptions,
      lastActiveAt: user.lastActiveAt,
    };

    res.status(200).json({
      success: true,
      data: {
        user: userResponse,
        token,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to login',
        details: (error as Error).message,
      },
    });
  }
});

// Get current user profile
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
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
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        details: (error as Error).message,
      },
    });
  }
});

// Get user dashboard data
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
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
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    // Get user's questionnaires
    const questionnaires = await Questionnaire.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    const dashboardData = {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
      },
      subscriptions: user.subscriptions || [],
      transactions: user.transactions || [],
      questionnaires: questionnaires,
      stats: {
        totalQuestionnaires: questionnaires.length,
        activeSubscriptions: user.subscriptions?.filter(sub => sub.status === 'active').length || 0,
        totalTransactions: user.transactions?.length || 0,
        totalSpent: user.transactions?.reduce((sum, transaction) => 
          transaction.status === 'completed' ? sum + transaction.amount : sum, 0) || 0,
      }
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        details: (error as Error).message,
      },
    });
  }
});

// Forgot password
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: { message: 'Email is required' },
      });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.isAnonymous) {
      res.status(404).json({
        success: false,
        error: { message: 'No account found with that email address' },
      });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await user.save();

    // In a real application, you would send an email here
    // For now, we'll just return the token for testing
    res.status(200).json({
      success: true,
      message: 'Password reset token generated',
      data: {
        resetToken, // Remove this in production
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to process forgot password request',
        details: (error as Error).message,
      },
    });
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      res.status(400).json({
        success: false,
        error: { message: 'Reset token and new password are required' },
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters long' },
      });
      return;
    }

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid or expired reset token' },
      });
      return;
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to reset password',
        details: (error as Error).message,
      },
    });
  }
});

export default router;
