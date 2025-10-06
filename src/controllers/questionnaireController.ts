import { Request, Response } from 'express';
import { Questionnaire } from '../models/Questionnaire';
import { AuthenticatedRequest } from '../middleware/auth';

interface QuestionnaireRequest extends AuthenticatedRequest {
  body: {
    answers?: { [key: string]: string };
    currentStep?: number;
    answer?: { key: string; value: string };
    isCompleted?: boolean;
  };
  params: {
    userId?: string;
  };
}

// Create, update, or complete questionnaire
export const saveQuestionnaire = async (req: QuestionnaireRequest, res: Response): Promise<void> => {
  try {
    const { answers, currentStep, isCompleted } = req.body;

    // Ensure user is authenticated
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: { message: 'User must be authenticated to save questionnaire' },
      });
      return;
    }

    // Always use userId to find/create questionnaire
    let questionnaire = await Questionnaire.findOne({ userId: req.userId });

    if (questionnaire) {
      // Update existing questionnaire
      if (answers) {
        questionnaire.answers = { ...questionnaire.answers, ...answers };
      }
      if (typeof currentStep === 'number') {
        questionnaire.currentStep = currentStep;
      }
      if (typeof isCompleted === 'boolean') {
        questionnaire.isCompleted = isCompleted;
        if (isCompleted) {
          questionnaire.completedAt = new Date();
        }
      }
      questionnaire.updatedAt = new Date();
    } else {
      // Create new questionnaire
      const questionnaireData: any = {
        userId: req.userId,
        answers: answers || {},
        currentStep: currentStep || 0,
      };
      if (typeof isCompleted === 'boolean') {
        questionnaireData.isCompleted = isCompleted;
        if (isCompleted) {
          questionnaireData.completedAt = new Date();
        }
      }
      questionnaire = new Questionnaire(questionnaireData);
    }

    await questionnaire.save();

    res.status(200).json({
      success: true,
      data: {
        userId: questionnaire.userId,
        answers: questionnaire.answers,
        currentStep: questionnaire.currentStep,
        isCompleted: questionnaire.isCompleted,
        completedAt: questionnaire.completedAt,
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
}; // Update a single answer
export const updateAnswer = async (req: QuestionnaireRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { answer } = req.body;
    
    // Use authenticated user's ID or the provided userId
    const targetUserId = req.userId || userId;
    
    if (!targetUserId) {
      res.status(401).json({
        success: false,
        error: { message: 'User must be authenticated or userId must be provided' },
      });
      return;
    }
    
    if (!answer || !answer.key || !answer.value) {
      res.status(400).json({
        success: false,
        error: { message: 'Answer key and value are required' },
      });
      return;
    }
    
    let questionnaire = await Questionnaire.findOne({ userId: targetUserId });
    
    if (!questionnaire) {
      questionnaire = new Questionnaire({
        userId: targetUserId,
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
        userId: questionnaire.userId,
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

// Get questionnaire by user ID
export const getQuestionnaire = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    
    const questionnaire = await Questionnaire.findOne({ userId });
    
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
        userId: questionnaire.userId,
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

// ...existing code...
