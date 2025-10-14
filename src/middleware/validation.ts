import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// Validation middleware for questionnaire
export const validateQuestionnaire = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { answers, currentStep } = req.body;
  
  if (!answers && currentStep === undefined) {
    res.status(400).json({
      success: false,
      error: { message: 'Answers or currentStep are required' },
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
  const { userId } = req.params;
  
  if (!userId) {
    res.status(400).json({
      success: false,
      error: { message: 'User ID is required' },
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
  // Since we're using authenticated users, no additional validation needed
  // The authentication middleware will ensure we have a valid user
  next();
};

// Generic validation middleware for express-validator
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: errors.array()
      }
    });
    return;
  }
  
  next();
};
