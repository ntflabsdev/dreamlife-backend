import express from 'express';
import {
  submitContact,
  getContacts,
  updateContactStatus,
} from '../controllers/contactController';
import { validateContact } from '../middleware/validation';

const router = express.Router();

// Submit contact form
router.post('/', validateContact, submitContact);

// Get all contacts (admin only - would need auth middleware)
router.get('/', getContacts);

// Update contact status (admin only - would need auth middleware)
router.patch('/:id/status', updateContactStatus);

export default router;
