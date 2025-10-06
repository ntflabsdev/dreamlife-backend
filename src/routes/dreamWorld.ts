import express from 'express';
import {
  generateDreamWorld,
  getDreamWorld,
} from '../controllers/dreamWorldController';
import { validateDreamWorldGeneration } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Generate dream world from questionnaire (requires authentication)
router.post('/generate', authenticateToken, validateDreamWorldGeneration, generateDreamWorld);

// Get dream world by user ID
router.get('/:userId', authenticateToken, getDreamWorld);

export default router;
