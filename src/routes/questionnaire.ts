import express from 'express';
import {
  saveQuestionnaire,
  updateAnswer,
  getQuestionnaire,
} from '../controllers/questionnaireController';
import { validateQuestionnaire, validateAnswer } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Save or update entire questionnaire (requires authentication)
router.post('/', authenticateToken, validateQuestionnaire, saveQuestionnaire);

// Update a single answer
router.patch('/:userId/answer', authenticateToken, validateAnswer, updateAnswer);

// Get questionnaire by user ID
router.get('/:userId', authenticateToken, getQuestionnaire);


export default router;
