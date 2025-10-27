import express from 'express';
import { register, login, profile, dashboard, forgotPassword, resetPassword } from '../controllers/authController';

const router = express.Router();

// Map routes to controller handlers
router.post('/register', register);
router.post('/login', login);
router.get('/profile', profile);
router.get('/dashboard', dashboard);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
