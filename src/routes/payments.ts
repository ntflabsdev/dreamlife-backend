import express, { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
// Removed legacy PayPal order endpoints (create/capture/get) since frontend uses PayPal JS SDK directly.

const router = express.Router();

// Helper to get PayPal access token
const getPayPalAccessToken = async (): Promise<string> => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseURL = process.env.NODE_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await axios.post(
    `${baseURL}/v1/oauth2/token`,
    'grant_type=client_credentials',
    { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return resp.data.access_token;
};

// (Intentionally no /paypal/* order routes. Frontend handles order creation via SDK; backend only stores results.)

// Add transaction
router.post('/transactions', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { transactionId, amount, currency, status, paypalOrderId } = req.body;
    
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    const transaction = {
      transactionId,
      amount: parseFloat(amount),
      currency: currency || 'USD',
      status,
      paypalOrderId,
      createdAt: new Date(),
    };

    user.transactions = user.transactions || [];
    user.transactions.push(transaction);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Transaction added successfully',
      data: { transaction },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to add transaction',
        details: (error as Error).message,
      },
    });
  }
});

// Add subscription
router.post('/subscriptions', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { planId, planName, status, startDate, endDate, paypalSubscriptionId } = req.body;
    
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    const subscription = {
      planId,
      planName,
      status,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      paypalSubscriptionId,
    };

    user.subscriptions = user.subscriptions || [];
    user.subscriptions.push(subscription);
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Subscription added successfully',
      data: { subscription },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to add subscription',
        details: (error as Error).message,
      },
    });
  }
});

// Update subscription status
router.patch('/subscriptions/:subscriptionId', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;
    const { status, endDate } = req.body;
    
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: { message: 'User not authenticated' },
      });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    const subscription = user.subscriptions?.find(sub => sub.paypalSubscriptionId === subscriptionId);
    if (!subscription) {
      res.status(404).json({
        success: false,
        error: { message: 'Subscription not found' },
      });
      return;
    }

    if (status) subscription.status = status;
    if (endDate) subscription.endDate = new Date(endDate);

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Subscription updated successfully',
      data: { subscription },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update subscription',
        details: (error as Error).message,
      },
    });
  }
});

// Cancel subscription (convenience endpoint)
router.post('/subscriptions/:subscriptionId/cancel', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params; // PayPal subscription ID
    const { reason } = req.body;

    if (!req.userId) {
      res.status(401).json({ success: false, error: { message: 'User not authenticated' } });
      return;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    const userSub = user.subscriptions?.find(sub => sub.paypalSubscriptionId === subscriptionId);
    if (!userSub) {
      res.status(404).json({ success: false, error: { message: 'Subscription not found for user' } });
      return;
    }

    // Call PayPal to cancel (idempotent attempt)
    try {
      const token = await getPayPalAccessToken();
      const baseURL = process.env.NODE_ENV === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
      await axios.post(
        `${baseURL}/v1/billing/subscriptions/${subscriptionId}/cancel`,
        { reason: reason || 'User requested cancellation' },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
    } catch (ppErr: any) {
      // If already cancelled at PayPal (e.g., 422 status), proceed to update local state
      const status = ppErr?.response?.status;
      if (!(status === 422 || status === 404)) { // tolerate already-cancelled / not found
        console.error('PayPal cancel error:', ppErr.response?.data || ppErr.message);
        res.status(502).json({ success: false, error: { message: 'Failed to cancel at PayPal', details: ppErr.response?.data || ppErr.message } });
        return;
      }
    }

    // Update user embedded subscription record
    userSub.status = 'cancelled';
    userSub.endDate = new Date();
    await user.save();

    // Update Subscription collection record if exists
    const subscriptionDoc = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });
    if (subscriptionDoc) {
      subscriptionDoc.status = 'CANCELLED';
      subscriptionDoc.cancelledAt = new Date();
      subscriptionDoc.webhookEvents = subscriptionDoc.webhookEvents || [];
      subscriptionDoc.webhookEvents.push({
        eventType: 'BILLING.SUBSCRIPTION.CANCELLED',
        eventData: { reason: reason || 'User requested cancellation (manual)' },
        receivedAt: new Date(),
        processed: true
      });
      await subscriptionDoc.save();
    }

    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: {
        userSubscription: userSub,
        subscription: subscriptionDoc || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: 'Failed to cancel subscription', details: (error as Error).message }
    });
  }
});

export default router;
