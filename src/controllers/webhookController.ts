import { Request, Response } from 'express';
import crypto from 'crypto';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';

// PayPal webhook event verification
const verifyPayPalWebhook = (req: Request): boolean => {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const webhookSecret = process.env.PAYPAL_WEBHOOK_SECRET;
    
    if (!webhookId || !webhookSecret) {
      console.warn('PayPal webhook verification skipped - missing configuration');
      return true; // Skip verification in development
    }

    // Get headers
    const authAlgo = req.headers['paypal-auth-algo'] as string;
    const transmission = req.headers['paypal-transmission-id'] as string;
    const certId = req.headers['paypal-cert-id'] as string;
    const timestamp = req.headers['paypal-transmission-time'] as string;
    const signature = req.headers['paypal-transmission-sig'] as string;

    if (!authAlgo || !transmission || !certId || !timestamp || !signature) {
      console.error('Missing PayPal webhook headers');
      return false;
    }

    // Create expected signature (simplified verification)
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}${payload}`)
      .digest('base64');

    return signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying PayPal webhook:', error);
    return false;
  }
};

// Handle PayPal webhook events
export const handlePayPalWebhook = async (req: Request, res: Response) => {
  try {
    console.log('Processing PayPal webhook...',req.body);
    if (process.env.NODE_ENV === 'production' && !verifyPayPalWebhook(req)) {
      return res.status(401).json({ error: 'Webhook verification failed' });
    }

    const event = req.body;
    console.log('Received PayPal webhook event:', event.event_type);

    let subscriptionId: string | null = null;
    
    if (event.resource?.id) {
      subscriptionId = event.resource.id;
    } else if (event.resource?.billing_agreement_id) {
      subscriptionId = event.resource.billing_agreement_id;
    } else if (event.resource?.subscription_id) {
      subscriptionId = event.resource.subscription_id;
    }

    if (!subscriptionId) {
      console.error('No subscription ID found in webhook event');
      return res.status(400).json({ error: 'No subscription ID found' });
    }

    // Find subscription in database
    const subscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId });

    if (!subscription) {
      console.error(`Subscription not found: ${subscriptionId}`);
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Log webhook event
    subscription.webhookEvents.push({
      eventType: event.event_type,
      eventData: event,
      receivedAt: new Date(),
      processed: false
    });

    // Process different event types
    switch (event.event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(subscription, event);
        break;
        
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(subscription, event);
        break;
        
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(subscription, event);
        break;
        
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handlePaymentFailed(subscription, event);
        break;
        
      case 'PAYMENT.SALE.COMPLETED':
        await handlePaymentCompleted(subscription, event);
        break;
        
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handleSubscriptionExpired(subscription, event);
        break;
        
      default:
        console.log(`Unhandled webhook event type: ${event.event_type}`);
    }

    // Mark event as processed
    if (subscription.webhookEvents && subscription.webhookEvents.length > 0) {
      const lastEventIndex = subscription.webhookEvents.length - 1;
      if (subscription.webhookEvents[lastEventIndex]) {
        subscription.webhookEvents[lastEventIndex].processed = true;
      }
    }
    
    await subscription.save();

    return res.status(200).json({ message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }
};

// Handle subscription activated
const handleSubscriptionActivated = async (subscription: any, event: any) => {
  try {
    subscription.status = 'ACTIVE';
    subscription.activatedAt = new Date();
    
    // Update payment info
    if (event.resource.billing_info) {
      subscription.paymentInfo.nextBillingTime = new Date(event.resource.billing_info.next_billing_time);
    }
    
    // Update user's subscription status
    await User.findByIdAndUpdate(
      subscription.userId,
      {
        $set: {
          'subscriptions.$[elem].status': 'active'
        }
      },
      {
        arrayFilters: [{ 'elem.paypalSubscriptionId': subscription.paypalSubscriptionId }]
      }
    );

    console.log(`Subscription activated: ${subscription.paypalSubscriptionId}`);
  } catch (error) {
    console.error('Error handling subscription activation:', error);
  }
};

// Handle subscription cancelled
const handleSubscriptionCancelled = async (subscription: any, event: any) => {
  try {
    subscription.status = 'CANCELLED';
    subscription.cancelledAt = new Date();
    
    // Update user's subscription status
    await User.findByIdAndUpdate(
      subscription.userId,
      {
        $set: {
          'subscriptions.$[elem].status': 'cancelled'
        }
      },
      {
        arrayFilters: [{ 'elem.paypalSubscriptionId': subscription.paypalSubscriptionId }]
      }
    );

    console.log(`Subscription cancelled: ${subscription.paypalSubscriptionId}`);
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
  }
};

// Handle subscription suspended
const handleSubscriptionSuspended = async (subscription: any, event: any) => {
  try {
    subscription.status = 'SUSPENDED';
    
    // Update user's subscription status
    await User.findByIdAndUpdate(
      subscription.userId,
      {
        $set: {
          'subscriptions.$[elem].status': 'cancelled'
        }
      },
      {
        arrayFilters: [{ 'elem.paypalSubscriptionId': subscription.paypalSubscriptionId }]
      }
    );

    console.log(`Subscription suspended: ${subscription.paypalSubscriptionId}`);
  } catch (error) {
    console.error('Error handling subscription suspension:', error);
  }
};

// Handle payment failed
const handlePaymentFailed = async (subscription: any, event: any) => {
  try {
    subscription.paymentInfo.failedPaymentCount += 1;
    
    // If too many failures, mark subscription as expired
    if (subscription.paymentInfo.failedPaymentCount >= 3) {
      subscription.status = 'EXPIRED';
      subscription.expiredAt = new Date();
      
      await User.findByIdAndUpdate(
        subscription.userId,
        {
          $set: {
            'subscriptions.$[elem].status': 'expired'
          }
        },
        {
          arrayFilters: [{ 'elem.paypalSubscriptionId': subscription.paypalSubscriptionId }]
        }
      );
    }

    console.log(`Payment failed for subscription: ${subscription.paypalSubscriptionId}, failures: ${subscription.paymentInfo.failedPaymentCount}`);
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
};

// Handle payment completed
const handlePaymentCompleted = async (subscription: any, event: any) => {
  try {
    // Reset failed payment count on successful payment
    subscription.paymentInfo.failedPaymentCount = 0;
    subscription.paymentInfo.lastPaymentDate = new Date();
    
    if (event.resource.amount) {
      subscription.paymentInfo.lastPaymentAmount = parseFloat(event.resource.amount.total);
    }

    // Add transaction to user record
    const user = await User.findById(subscription.userId);
    if (user && event.resource) {
      user.transactions.push({
        transactionId: event.resource.id,
        amount: parseFloat(event.resource.amount?.total || '0'),
        currency: event.resource.amount?.currency || 'USD',
        status: 'completed',
        paypalOrderId: event.resource.parent_payment || event.resource.id,
        createdAt: new Date()
      });
      await user.save();
    }

    console.log(`Payment completed for subscription: ${subscription.paypalSubscriptionId}`);
  } catch (error) {
    console.error('Error handling payment completion:', error);
  }
};

// Handle subscription expired
const handleSubscriptionExpired = async (subscription: any, event: any) => {
  try {
    subscription.status = 'EXPIRED';
    subscription.expiredAt = new Date();
    
    // Update user's subscription status
    await User.findByIdAndUpdate(
      subscription.userId,
      {
        $set: {
          'subscriptions.$[elem].status': 'expired'
        }
      },
      {
        arrayFilters: [{ 'elem.paypalSubscriptionId': subscription.paypalSubscriptionId }]
      }
    );

    console.log(`Subscription expired: ${subscription.paypalSubscriptionId}`);
  } catch (error) {
    console.error('Error handling subscription expiration:', error);
  }
};
