import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';

const router = express.Router();

// Create anonymous user session
router.post('/session', async (req: Request, res: Response) => {
  try {
    const sessionId = uuidv4();
    
    const user = new User({
      sessionId,
      isAnonymous: true,
      lastActiveAt: new Date(),
    });
    
    await user.save();
    
    res.status(201).json({
      success: true,
      data: {
        sessionId,
        userId: user._id,
        isAnonymous: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create user session',
        details: (error as Error).message,
      },
    });
  }
});

// Get user by session ID
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    const user = await User.findOne({ sessionId });
    
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User session not found' },
      });
      return;
    }
    
    // Update last active
    user.lastActiveAt = new Date();
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        sessionId: user.sessionId,
        isAnonymous: user.isAnonymous,
        lastActiveAt: user.lastActiveAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get user session',
        details: (error as Error).message,
      },
    });
  }
});

export default router;
