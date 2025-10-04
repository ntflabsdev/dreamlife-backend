import express from 'express';
import {
  saveQuestionnaire,
  updateAnswer,
  getQuestionnaire,
  completeQuestionnaire,
} from '../controllers/questionnaireController';
import { validateQuestionnaire, validateAnswer } from '../middleware/validation';
import { optionalAuth } from '../middleware/auth';

const router = express.Router();

// Save or update entire questionnaire
router.post('/', optionalAuth, validateQuestionnaire, saveQuestionnaire);

// Update a single answer
router.patch('/:sessionId/answer', optionalAuth, validateAnswer, updateAnswer);

// Get questionnaire by session ID
router.get('/:sessionId', optionalAuth, getQuestionnaire);

// Mark questionnaire as completed
router.post('/:sessionId/complete', optionalAuth, completeQuestionnaire);

export default router;
