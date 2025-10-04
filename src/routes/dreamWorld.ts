import express from 'express';
import {
  generateDreamWorld,
  getDreamWorld,
} from '../controllers/dreamWorldController';
import { validateDreamWorldGeneration } from '../middleware/validation';

const router = express.Router();

// Generate dream world from questionnaire
router.post('/generate', validateDreamWorldGeneration, generateDreamWorld);

// Get dream world by session ID
router.get('/:sessionId', getDreamWorld);

export default router;
