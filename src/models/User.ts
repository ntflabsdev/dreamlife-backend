import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  _id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  avatar?: string;
  isAnonymous: boolean;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
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
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  avatar: {
    type: String,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
  },
  emailVerificationExpires: {
    type: Date,
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
userSchema.pre('save', async function (next) {
  const user = this as IUser;
  if (!user.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  const user = this as IUser;
  if (!user.password) return false;
  return bcrypt.compare(candidatePassword, user.password);
};

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ resetPasswordToken: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
