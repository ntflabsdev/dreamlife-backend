import { Request, Response, NextFunction } from 'express';

// Validation middleware for questionnaire
export const validateQuestionnaire = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { sessionId, answers, currentStep } = req.body;
  
  if (!sessionId && !answers) {
    res.status(400).json({
      success: false,
      error: { message: 'Session ID or answers are required' },
    });
    return;
  }
  
  if (currentStep !== undefined && (typeof currentStep !== 'number' || currentStep < 0)) {
    res.status(400).json({
      success: false,
      error: { message: 'Current step must be a non-negative number' },
    });
    return;
  }
  
  next();
};

// Validation middleware for single answer update
export const validateAnswer = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { answer } = req.body;
  const { sessionId } = req.params;
  
  if (!sessionId) {
    res.status(400).json({
      success: false,
      error: { message: 'Session ID is required' },
    });
    return;
  }
  
  if (!answer || typeof answer !== 'object') {
    res.status(400).json({
      success: false,
      error: { message: 'Answer object is required' },
    });
    return;
  }
  
  if (!answer.key || typeof answer.key !== 'string') {
    res.status(400).json({
      success: false,
      error: { message: 'Answer key is required and must be a string' },
    });
    return;
  }
  
  if (!answer.value || typeof answer.value !== 'string') {
    res.status(400).json({
      success: false,
      error: { message: 'Answer value is required and must be a string' },
    });
    return;
  }
  
  next();
};

// Validation middleware for contact form
export const validateContact = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { firstName, lastName, email, message } = req.body;
  
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'First name is required and must be a non-empty string' },
    });
    return;
  }
  
  if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'Last name is required and must be a non-empty string' },
    });
    return;
  }
  
  if (!email || typeof email !== 'string') {
    res.status(400).json({
      success: false,
      error: { message: 'Email is required and must be a string' },
    });
    return;
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      success: false,
      error: { message: 'Please provide a valid email address' },
    });
    return;
  }
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: { message: 'Message is required and must be a non-empty string' },
    });
    return;
  }
  
  if (message.length > 5000) {
    res.status(400).json({
      success: false,
      error: { message: 'Message must be less than 5000 characters' },
    });
    return;
  }
  
  next();
};

// Validation middleware for dream world generation
export const validateDreamWorldGeneration = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { sessionId } = req.body;
  
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { message: 'Session ID is required and must be a string' },
    });
    return;
  }
  
  next();
};
