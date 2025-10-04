import { Request, Response } from 'express';
import { 
  OrdersController, 
  OrderRequest,
  AmountWithBreakdown,
  PurchaseUnitRequest,
  CheckoutPaymentIntent,
  OrderApplicationContextUserAction
} from '@paypal/paypal-server-sdk';
import { getPaypalClient } from '../config/paypal';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';

export const createPayPalOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, currency = 'USD', planName } = req.body;

    if (!amount || !planName) {
      res.status(400).json({
        success: false,
        error: { message: 'Amount and plan name are required' }
      });
      return;
    }

    const ordersController = new OrdersController(getPaypalClient());

    const amountObj: AmountWithBreakdown = {
      currencyCode: currency,
      value: amount.toString()
    };

    const purchaseUnit: PurchaseUnitRequest = {
      amount: amountObj,
      description: `${planName} - DreamLife Subscription`
    };

    const orderRequest: OrderRequest = {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [purchaseUnit],
      applicationContext: {
        returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
        cancelUrl: `${process.env.FRONTEND_URL}/payment/cancel`,
        brandName: 'DreamLife',
        userAction: OrderApplicationContextUserAction.PayNow
      }
    };

    const response = await ordersController.createOrder({
      body: orderRequest,
      prefer: 'return=representation'
    });
    
    const order = response.body as any;
    console.log("order",response)
    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        approvalUrl: order.links?.find((link: any) => link.rel === 'approve')?.href
      }
    });
  } catch (error) {
    console.error('PayPal create order error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create PayPal order',
        details: (error as Error).message
      }
    });
  }
};

// Capture PayPal Order
export const capturePayPalOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      res.status(400).json({
        success: false,
        error: { message: 'Order ID is required' }
      });
      return;
    }

    const ordersController = new OrdersController(getPaypalClient());
    const { body: order } = await ordersController.captureOrder({
      id: orderId,
      prefer: 'return=representation'
    });

    const orderData = order as any;

    // Verify the order was captured successfully
    if (orderData.status !== 'COMPLETED') {
      res.status(400).json({
        success: false,
        error: { message: 'Payment was not completed successfully' }
      });
      return;
    }

    // Extract payment details
    const captureDetails = orderData.purchaseUnits?.[0]?.payments?.captures?.[0];
    
    if (!captureDetails || !req.userId) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid payment details or user not authenticated' }
      });
      return;
    }

    // Save transaction to database
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' }
      });
      return;
    }

    const transaction = {
      transactionId: captureDetails.id,
      amount: parseFloat(captureDetails.amount?.value || '0'),
      currency: captureDetails.amount?.currencyCode || 'USD',
      status: 'completed' as const,
      paypalOrderId: orderId,
      createdAt: new Date(),
    };

    user.transactions = user.transactions || [];
    user.transactions.push(transaction);

    // Create subscription based on payment
    const description = orderData.purchaseUnits?.[0]?.description || '';
    let planId = 'unknown-plan';
    let planName = 'Unknown Plan';

    if (description.includes('Visionary')) {
      planId = 'visionary-plan';
      planName = 'Visionary (Core Plan)';
    } else if (description.includes('Legend')) {
      planId = 'legend-plan';
      planName = 'Legend (VIP Plan)';
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    const subscription = {
      planId,
      planName,
      status: 'active' as const,
      startDate,
      endDate,
      paypalSubscriptionId: orderId,
    };

    user.subscriptions = user.subscriptions || [];
    user.subscriptions.push(subscription);

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Payment captured and subscription activated successfully',
      data: {
        order: orderData,
        transaction,
        subscription
      }
    });
  } catch (error) {
    console.error('PayPal capture order error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to capture PayPal order',
        details: (error as Error).message
      }
    });
  }
};

// Get Order Details
export const getPayPalOrderDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      res.status(400).json({
        success: false,
        error: { message: 'Order ID is required' }
      });
      return;
    }

    const ordersController = new OrdersController(getPaypalClient());
    const { body: order } = await ordersController.getOrder({
      id: orderId
    });

    const orderData = order as any;

    res.status(200).json({
      success: true,
      data: { order: orderData }
    });
  } catch (error) {
    console.error('PayPal get order error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get PayPal order details',
        details: (error as Error).message
      }
    });
  }
};
