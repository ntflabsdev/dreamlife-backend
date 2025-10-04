import { Request, Response } from 'express';
import axios from 'axios';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import {
	initializeSubscriptionPlans as seedInitialize,
	getSubscriptionPlans as seedGetPlans,
	getSeededPlans
} from '../seeds/subscriptionSeed';

// Re-export seed helpers
export const initializeSubscriptionPlans = seedInitialize;
export const getSubscriptionPlans = seedGetPlans;

interface PayPalAccessTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

const getPayPalAccessToken = async (): Promise<string> => {
	const clientId = process.env.PAYPAL_CLIENT_ID;
	const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
	const baseURL = process.env.NODE_ENV === 'production'
		? 'https://api-m.paypal.com'
		: 'https://api-m.sandbox.paypal.com';

	if (!clientId || !clientSecret) throw new Error('PayPal credentials not configured');

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	try {
		const response = await axios.post<PayPalAccessTokenResponse>(
			`${baseURL}/v1/oauth2/token`,
			'grant_type=client_credentials',
			{ headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
		);
		return response.data.access_token;
	} catch (e: any) {
		console.error('PayPal token error', e.response?.data || e.message);
		throw new Error('Failed to get PayPal access token');
	}
};

export const checkExistingSubscriptions = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const userId = req.user?._id;
		const email = req.body.email || req.user?.email;
		if (!userId && !email) {
			return res.status(400).json({ success: false, message: 'User ID or email is required' });
		}
		const user = userId ? await User.findById(userId) : await User.findOne({ email });
		if (!user) return res.status(404).json({ success: false, message: 'User not found' });
		const activeSubscriptions = await Subscription.find({ userId: user._id, status: { $in: ['ACTIVE', 'PENDING'] } });
		if (activeSubscriptions.length) {
			return res.status(200).json({
				success: true,
				hasActiveSubscription: true,
				subscriptions: activeSubscriptions.map(sub => ({
					id: sub._id,
						planName: sub.planName,
						status: sub.status,
						paypalSubscriptionId: sub.paypalSubscriptionId,
						nextBillingTime: sub.paymentInfo.nextBillingTime,
						isInTrial: sub.trialInfo?.isTrialPeriod && sub.trialInfo.trialEndDate ? new Date() < sub.trialInfo.trialEndDate : false
				})),
				message: 'User has active subscriptions. Please cancel existing subscriptions before creating a new one.'
			});
		}
		return res.status(200).json({ success: true, hasActiveSubscription: false, message: 'No active subscriptions found' });
	} catch (e) {
		console.error('checkExistingSubscriptions error', e);
		return res.status(500).json({ success: false, message: 'Failed to check existing subscriptions' });
	}
};

export const createSubscription = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { planId, subscriberInfo } = req.body;
		const userId = req.user?._id;
		if (!planId) return res.status(400).json({ success: false, message: 'Plan ID is required' });
		if (!userId) return res.status(401).json({ success: false, message: 'User authentication required' });

		const existing = await Subscription.find({ userId, status: { $in: ['ACTIVE', 'PENDING'] } });
		if (existing.length) {
			return res.status(400).json({ success: false, message: 'You already have an active subscription.', hasActiveSubscription: true });
		}
		const user = await User.findById(userId);
		if (!user) return res.status(400).json({ success: false, message: 'User not found' });

		const plansData = getSeededPlans();
		if (!plansData) return res.status(500).json({ success: false, message: 'Plans not initialized' });

		let paypalPlanId: string; let planDetails: any;
		switch (planId) {
			case 'visionary-plan':
			case 'visionary':
				paypalPlanId = plansData.visionaryPlan.id; planDetails = plansData.visionaryPlan; break;
			case 'legend-plan':
			case 'legend':
				paypalPlanId = plansData.legendPlan.id; planDetails = plansData.legendPlan; break;
			default:
				return res.status(400).json({ success: false, message: `Invalid plan ID: ${planId}` });
		}

		const accessToken = await getPayPalAccessToken();
		const baseURL = process.env.NODE_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
		const subscriptionData = {
			plan_id: paypalPlanId,
			start_time: new Date(Date.now() + 60000).toISOString(),
			subscriber: subscriberInfo || {
				name: { given_name: user.firstName || 'DreamLife', surname: user.lastName || 'User' },
				email_address: user.email
			},
			application_context: {
				brand_name: 'DreamLife', locale: 'en-US', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
				payment_method: { payer_selected: 'PAYPAL', payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED' },
				return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription/success`,
				cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/subscription/cancel`
			}
		};

		const paypalResponse = await axios.post(
			`${baseURL}/v1/billing/subscriptions`,
			subscriptionData,
			{ headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'PayPal-Request-Id': `subscription-${Date.now()}-${Math.random()}` } }
		);

		const subscription = new Subscription({
			userId: user._id,
			paypalSubscriptionId: paypalResponse.data.id,
			planId,
			planName: planDetails.name,
			status: 'PENDING',
			subscriberInfo: subscriptionData.subscriber,
			billing: { amount: parseFloat(planDetails.price), currency: 'USD', interval: 'MONTH', intervalCount: 1 },
			trialInfo: {
				isTrialPeriod: planDetails.trialDays > 0,
				trialDays: planDetails.trialDays,
				trialStartDate: planDetails.trialDays > 0 ? new Date() : undefined,
				trialEndDate: planDetails.trialDays > 0 ? new Date(Date.now() + planDetails.trialDays * 86400000) : undefined
			},
			paymentInfo: { failedPaymentCount: 0 },
			paypalData: paypalResponse.data
		});
		await subscription.save();

		user.subscriptions.push({ planId, planName: planDetails.name, status: 'active', startDate: new Date(), paypalSubscriptionId: paypalResponse.data.id });
		await user.save();

		return res.status(200).json({
			success: true,
			data: {
				subscriptionId: paypalResponse.data.id,
				status: paypalResponse.data.status,
				approvalUrl: paypalResponse.data.links?.find((l: any) => l.rel === 'approve')?.href,
				databaseId: subscription._id
			},
			message: 'Subscription created and saved successfully'
		});
	} catch (e: any) {
		console.error('createSubscription error', e.response?.data || e.message);
		return res.status(500).json({ success: false, message: 'Failed to create subscription', details: e.response?.data || e.message });
	}
};

export const getSubscriptionDetails = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { subscriptionId } = req.params;
		if (!subscriptionId) return res.status(400).json({ success: false, message: 'Subscription ID is required' });
		const dbSubscription = await Subscription.findOne({ paypalSubscriptionId: subscriptionId }).populate('userId', 'email firstName lastName');
		let paypalData = null;
		try {
			const accessToken = await getPayPalAccessToken();
			const baseURL = process.env.NODE_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
			const pr = await axios.get(`${baseURL}/v1/billing/subscriptions/${subscriptionId}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
			paypalData = pr.data;
		} catch (e: any) {
			console.error('PayPal fetch subscription error', e.response?.data || e.message);
		}
		if (dbSubscription) {
			const isActive = dbSubscription.status === 'ACTIVE';
			const isInTrial = dbSubscription.trialInfo?.isTrialPeriod && dbSubscription.trialInfo.trialEndDate ? new Date() < dbSubscription.trialInfo.trialEndDate : false;
			return res.status(200).json({ success: true, data: { database: {
				id: dbSubscription._id,
				status: dbSubscription.status,
				planName: dbSubscription.planName,
				billing: dbSubscription.billing,
				trialInfo: dbSubscription.trialInfo,
				paymentInfo: dbSubscription.paymentInfo,
				isActive,
				isInTrial,
				createdAt: dbSubscription.createdAt,
				activatedAt: dbSubscription.activatedAt
			}, paypal: paypalData, user: dbSubscription.userId } });
		}
		if (paypalData) return res.status(200).json({ success: true, data: { database: null, paypal: paypalData, user: null } });
		return res.status(404).json({ success: false, message: 'Subscription not found' });
	} catch (e) {
		console.error('getSubscriptionDetails error', e);
		return res.status(500).json({ success: false, message: 'Failed to get subscription details' });
	}
};

export const cancelSubscription = async (req: Request, res: Response) => {
	try {
		const { subscriptionId } = req.params;
		const { reason } = req.body;
		const accessToken = await getPayPalAccessToken();
		const baseURL = process.env.NODE_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
		await axios.post(`${baseURL}/v1/billing/subscriptions/${subscriptionId}/cancel`, { reason: reason || 'User requested cancellation' }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
		const subscription = await Subscription.findOneAndUpdate({ paypalSubscriptionId: subscriptionId }, { status: 'CANCELLED', cancelledAt: new Date(), $push: { webhookEvents: { eventType: 'BILLING.SUBSCRIPTION.CANCELLED', eventData: { reason, cancelledBy: 'user' }, receivedAt: new Date(), processed: true } } }, { new: true });
		if (subscription) {
			await User.findByIdAndUpdate(subscription.userId, { $set: { 'subscriptions.$[elem].status': 'cancelled', 'subscriptions.$[elem].endDate': new Date() } }, { arrayFilters: [{ 'elem.paypalSubscriptionId': subscriptionId }] });
		}
		return res.status(200).json({ success: true, message: 'Subscription cancelled successfully' });
	} catch (e) {
		console.error('cancelSubscription error', e);
		return res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
	}
};

export const getUserSubscriptions = async (req: AuthenticatedRequest, res: Response) => {
	try {
		const userId = req.user?._id;
		if (!userId) return res.status(401).json({ success: false, message: 'User authentication required' });
		const subs = await Subscription.find({ userId }).sort({ createdAt: -1 });
		return res.status(200).json({
			success: true,
			data: subs.map(sub => {
				const isActive = sub.status === 'ACTIVE';
				const isInTrial = sub.trialInfo?.isTrialPeriod && sub.trialInfo.trialEndDate ? new Date() < sub.trialInfo.trialEndDate : false;
				return {
					id: sub._id,
					paypalSubscriptionId: sub.paypalSubscriptionId,
					planName: sub.planName,
					status: sub.status,
					billing: sub.billing,
					trialInfo: sub.trialInfo,
					paymentInfo: sub.paymentInfo,
					isActive,
					isInTrial,
					createdAt: sub.createdAt,
					activatedAt: sub.activatedAt,
					cancelledAt: sub.cancelledAt
				};
			})
		});
	} catch (e) {
		console.error('getUserSubscriptions error', e);
		return res.status(500).json({ success: false, message: 'Failed to get user subscriptions' });
	}
};

export {};
