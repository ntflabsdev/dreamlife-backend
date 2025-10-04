import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  paypalSubscriptionId: string;
  planId: string;
  planName: string;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'SUSPENDED' | 'EXPIRED';
  subscriberInfo: {
    name: {
      given_name: string;
      surname: string;
    };
    email_address: string;
  };
  billing: {
    amount: number;
    currency: string;
    interval: string; // MONTH, YEAR
    intervalCount: number;
  };
  trialInfo?: {
    isTrialPeriod: boolean;
    trialDays: number;
    trialStartDate?: Date;
    trialEndDate?: Date;
  };
  paymentInfo: {
    nextBillingTime?: Date;
    lastPaymentDate?: Date;
    lastPaymentAmount?: number;
    failedPaymentCount: number;
  };
  paypalData?: any; // Raw PayPal subscription data
  webhookEvents: Array<{
    eventType: string;
    eventData: any;
    receivedAt: Date;
    processed: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
  activatedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}

const subscriptionSchema = new Schema<ISubscription>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  paypalSubscriptionId: {
    type: String,
    required: true,
    unique: true,
  },
  planId: {
    type: String,
    required: true,
  },
  planName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'CANCELLED', 'SUSPENDED', 'EXPIRED'],
    default: 'PENDING',
    required: true,
  },
  subscriberInfo: {
    name: {
      given_name: { type: String, required: true },
      surname: { type: String, required: true },
    },
    email_address: { type: String, required: true },
  },
  billing: {
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD', required: true },
    interval: { type: String, enum: ['MONTH', 'YEAR'], default: 'MONTH', required: true },
    intervalCount: { type: Number, default: 1, required: true },
  },
  trialInfo: {
    isTrialPeriod: { type: Boolean, default: false },
    trialDays: { type: Number, default: 0 },
    trialStartDate: Date,
    trialEndDate: Date,
  },
  paymentInfo: {
    nextBillingTime: Date,
    lastPaymentDate: Date,
    lastPaymentAmount: Number,
    failedPaymentCount: { type: Number, default: 0 },
  },
  paypalData: Schema.Types.Mixed,
  webhookEvents: [{
    eventType: { type: String, required: true },
    eventData: { type: Schema.Types.Mixed, required: true },
    receivedAt: { type: Date, default: Date.now },
    processed: { type: Boolean, default: false },
  }],
  activatedAt: Date,
  cancelledAt: Date,
  expiredAt: Date,
}, {
  timestamps: true,
});

// Indexes for better performance
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ paypalSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ planId: 1 });
subscriptionSchema.index({ 'subscriberInfo.email_address': 1 });
subscriptionSchema.index({ createdAt: -1 });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function(): boolean {
  return this.status === 'ACTIVE';
};

// Method to check if user is in trial period
subscriptionSchema.methods.isInTrial = function(): boolean {
  if (!this.trialInfo?.isTrialPeriod) return false;
  if (!this.trialInfo.trialEndDate) return false;
  return new Date() < this.trialInfo.trialEndDate;
};

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
