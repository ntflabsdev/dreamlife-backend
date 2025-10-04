import { Request, Response } from 'express';
import { Questionnaire } from '../models/Questionnaire';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

interface QuestionnaireRequest extends AuthenticatedRequest {
  body: {
    sessionId?: string;
    answers?: { [key: string]: string };
    currentStep?: number;
    answer?: { key: string; value: string };
  };
  params: {
    sessionId?: string;
  };
}

// Create or update questionnaire
export const saveQuestionnaire = async (req: QuestionnaireRequest, res: Response): Promise<void> => {
  try {
    const { sessionId, answers, currentStep } = req.body;
    
    // If user is authenticated, use their ID, otherwise use session ID
    let questionnaire;
    
    if (req.userId) {
      // Authenticated user - find their questionnaire
      questionnaire = await Questionnaire.findOne({ userId: req.userId });
    } else {
      // Anonymous user - use session ID
      const finalSessionId = sessionId || uuidv4();
      questionnaire = await Questionnaire.findOne({ sessionId: finalSessionId });
    }
    
    if (questionnaire) {
      // Update existing questionnaire
      if (answers) {
        questionnaire.answers = { ...questionnaire.answers, ...answers };
      }
      if (typeof currentStep === 'number') {
        questionnaire.currentStep = currentStep;
      }
      questionnaire.updatedAt = new Date();
    } else {
      // Create new questionnaire
      const questionnaireData: any = {
        answers: answers || {},
        currentStep: currentStep || 0,
      };
      
      if (req.userId) {
        questionnaireData.userId = req.userId;
      } else {
        questionnaireData.sessionId = sessionId || uuidv4();
      }
      
      questionnaire = new Questionnaire(questionnaireData);
    }
    
    await questionnaire.save();
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: questionnaire.sessionId,
        answers: questionnaire.answers,
        currentStep: questionnaire.currentStep,
        isCompleted: questionnaire.isCompleted,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to save questionnaire',
        details: (error as Error).message,
      },
    });
  }
};

// Update a single answer
export const updateAnswer = async (req: QuestionnaireRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { answer } = req.body;
    
    if (!answer || !answer.key || !answer.value) {
      res.status(400).json({
        success: false,
        error: { message: 'Answer key and value are required' },
      });
      return;
    }
    
    let questionnaire = await Questionnaire.findOne({ sessionId });
    
    if (!questionnaire) {
      questionnaire = new Questionnaire({
        sessionId,
        answers: {},
        currentStep: 0,
      });
    }
    
    questionnaire.answers = {
      ...questionnaire.answers,
      [answer.key]: answer.value,
    };
    
    await questionnaire.save();
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: questionnaire.sessionId,
        answers: questionnaire.answers,
        currentStep: questionnaire.currentStep,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update answer',
        details: (error as Error).message,
      },
    });
  }
};

// Get questionnaire by session ID
export const getQuestionnaire = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    const questionnaire = await Questionnaire.findOne({ sessionId });
    
    if (!questionnaire) {
      res.status(404).json({
        success: false,
        error: { message: 'Questionnaire not found' },
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: questionnaire.sessionId,
        answers: questionnaire.answers,
        currentStep: questionnaire.currentStep,
        isCompleted: questionnaire.isCompleted,
        createdAt: questionnaire.createdAt,
        updatedAt: questionnaire.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get questionnaire',
        details: (error as Error).message,
      },
    });
  }
};

// Complete questionnaire
export const completeQuestionnaire = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    const questionnaire = await Questionnaire.findOne({ sessionId });
    
    if (!questionnaire) {
      res.status(404).json({
        success: false,
        error: { message: 'Questionnaire not found' },
      });
      return;
    }
    
    questionnaire.isCompleted = true;
    questionnaire.completedAt = new Date();
    questionnaire.updatedAt = new Date();
    
    await questionnaire.save();
    
    res.status(200).json({
      success: true,
      data: {
        sessionId: questionnaire.sessionId,
        isCompleted: questionnaire.isCompleted,
        completedAt: questionnaire.completedAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to complete questionnaire',
        details: (error as Error).message,
      },
    });
  }
};
