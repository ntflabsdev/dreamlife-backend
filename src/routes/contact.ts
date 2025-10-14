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

router.get('/', getContacts);

router.patch('/:id/status', updateContactStatus);

export default router;
