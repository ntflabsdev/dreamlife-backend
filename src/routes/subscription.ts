import express from 'express';
import { handlePayPalWebhook } from '../controllers/webhookController';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { 
	checkExistingSubscriptions, 
	createSubscription, 
	getSubscriptionDetails, 
	cancelSubscription, 
	getUserSubscriptions, 
	getSubscriptionPlans 
} from '../controllers/subscriptionController';

const router = express.Router();

// Subscription plan info
router.get('/plans', getSubscriptionPlans);

// Check existing active subscriptions (auth optional; can supply email)
router.post('/check-existing', optionalAuth, checkExistingSubscriptions);

// Create a new subscription (backend records then user approves via PayPal redirect)
router.post('/create', authenticateToken, createSubscription);

// List user subscriptions
router.get('/user/subscriptions', authenticateToken, getUserSubscriptions);

// Get subscription details (merges DB + PayPal live data)
router.get('/:subscriptionId', authenticateToken, getSubscriptionDetails);

// Cancel a subscription
router.post('/:subscriptionId/cancel', authenticateToken, cancelSubscription);

// Webhook (raw body required for signature verification)
router.post('/webhook/paypal', express.raw({ type: 'application/json' }), handlePayPalWebhook);

export default router;
