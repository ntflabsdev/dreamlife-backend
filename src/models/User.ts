import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isAnonymous: boolean;
  sessionId?: string;
  isEmailVerified: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  subscriptions: Array<{
    planId: string;
    planName: string;
    status: 'active' | 'cancelled' | 'expired';
    startDate: Date;
    endDate?: Date;
    paypalSubscriptionId?: string;
  }>;
  transactions: Array<{
    transactionId: string;
    amount: number;
    currency: string;
    status: 'completed' | 'pending' | 'failed';
    paypalOrderId?: string;
    createdAt: Date;
  }>;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: function(this: IUser): boolean {
      return !this.isAnonymous;
    },
    unique: true,
    sparse: true, // Allow multiple documents with null email
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: function(this: IUser): boolean {
      return !this.isAnonymous;
    },
    minlength: 6,
  },
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  avatar: {
    type: String,
  },
  isAnonymous: {
    type: Boolean,
    default: true,
  },
  sessionId: {
    type: String,
    unique: true,
    sparse: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
  subscriptions: [{
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['active', 'cancelled', 'expired'],
      required: true 
    },
    startDate: { type: Date, required: true },
    endDate: Date,
    paypalSubscriptionId: String,
  }],
  transactions: [{
    transactionId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    status: { 
      type: String, 
      enum: ['completed', 'pending', 'failed'],
      required: true 
    },
    paypalOrderId: String,
    createdAt: { type: Date, default: Date.now },
  }],
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ sessionId: 1 });
userSchema.index({ isAnonymous: 1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ resetPasswordToken: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
