import { Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User';
import { Questionnaire } from '../models/Questionnaire';
import { verifyGoogleIdToken, verifyAppleIdToken } from '../services/oauthService';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

const generateToken = (userId: string): string => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, provider, idToken } = req.body;

    let providerProfile: { provider?: 'google'|'apple'; providerId?: string; email?: string; firstName?: string; lastName?: string } = {};
    if (provider) {
      if (!idToken) { res.status(400).json({ success: false, error: { message: 'idToken required for provider login' } }); return; }
      if (provider === 'google') providerProfile = await verifyGoogleIdToken(idToken) || {};
      else if (provider === 'apple') providerProfile = await verifyAppleIdToken(idToken) || {};
      if (!providerProfile.providerId) { res.status(400).json({ success: false, error: { message: 'Invalid provider token' } }); return; }
    }

    const finalEmail = (providerProfile.email || email || '').toLowerCase();
    if (!finalEmail) { res.status(400).json({ success: false, error: { message: 'Email is required' } }); return; }
    if (!provider && (!password || password.length < 6)) { res.status(400).json({ success: false, error: { message: 'Password must be at least 6 characters (or use provider).' } }); return; }

    const existingUser = await User.findOne({ email: finalEmail });
    if (existingUser && !existingUser.isAnonymous) { res.status(400).json({ success: false, error: { message: 'User already exists with this email' } }); return; }

    const user = new User({
      email: finalEmail,
      password: provider ? undefined : password,
      firstName: firstName || providerProfile.firstName,
      lastName: lastName || providerProfile.lastName,
      provider: providerProfile.provider,
      providerId: providerProfile.providerId,
      isAnonymous: false,
      isEmailVerified: !!provider, // assume verified for OAuth
      subscriptions: [],
      transactions: []
    });
    await user.save();
    const token = generateToken(user._id.toString());
  const userResponse = { _id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar, isEmailVerified: user.isEmailVerified, provider: user.provider, createdAt: user.createdAt };
    res.status(201).json({ success: true, data: { user: userResponse, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to register user', details: (error as Error).message } });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, provider, idToken } = req.body;
    let user: any = null;
    if (provider) {
      if (!idToken) { res.status(400).json({ success: false, error: { message: 'idToken required for provider login' } }); return; }
      let profile = provider === 'google' ? await verifyGoogleIdToken(idToken) : await verifyAppleIdToken(idToken);
      if (!profile || !profile.providerId) { res.status(401).json({ success: false, error: { message: 'Invalid provider token' } }); return; }
      const providerEmail = (profile.email || email || '').toLowerCase();
      user = await User.findOne({ email: providerEmail });
      if (!user) {
        user = new User({
          email: providerEmail,
          provider: profile.provider,
          providerId: profile.providerId,
          firstName: profile.firstName,
            lastName: profile.lastName,
          isAnonymous: false,
          isEmailVerified: true,
          subscriptions: [],
          transactions: []
        });
        await user.save();
      }
    } else {
      if (!email || !password) { res.status(400).json({ success: false, error: { message: 'Email and password are required' } }); return; }
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user || user.isAnonymous) { res.status(401).json({ success: false, error: { message: 'Invalid email or password' } }); return; }
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) { res.status(401).json({ success: false, error: { message: 'Invalid email or password' } }); return; }
    }
    user.lastActiveAt = new Date(); await user.save();
    const token = generateToken(user._id.toString());
    const userResponse = { _id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar, isEmailVerified: user.isEmailVerified, provider: user.provider, subscriptions: user.subscriptions, lastActiveAt: user.lastActiveAt };
    res.status(200).json({ success: true, data: { user: userResponse, token } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to login', details: (error as Error).message } });
  }
};

const verifyBearer = (req: Request, res: Response): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { res.status(401).json({ success: false, error: { message: 'No token provided' } }); return null; }
  const token = authHeader.split(' ')[1];
  if (!token) { res.status(401).json({ success: false, error: { message: 'No token provided' } }); return null; }
  return token;
};

export const profile = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = verifyBearer(req, res); if (!token) return;
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { userId: string };
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || user.isAnonymous) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    res.status(401).json({ success: false, error: { message: 'Invalid token', details: (error as Error).message } });
  }
};

export const dashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = verifyBearer(req, res); if (!token) return;
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { userId: string };
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || user.isAnonymous) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    const questionnaires = await Questionnaire.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);
    const dashboardData = { user: { _id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName, avatar: user.avatar, isEmailVerified: user.isEmailVerified, createdAt: user.createdAt }, subscriptions: user.subscriptions || [], transactions: user.transactions || [], questionnaires, stats: { totalQuestionnaires: questionnaires.length, activeSubscriptions: user.subscriptions?.filter(sub => sub.status === 'active').length || 0, totalTransactions: user.transactions?.length || 0, totalSpent: user.transactions?.reduce((sum, t) => t.status === 'completed' ? sum + t.amount : sum, 0) || 0 } };
    res.status(200).json({ success: true, data: dashboardData });
  } catch (error) {
    res.status(401).json({ success: false, error: { message: 'Invalid token', details: (error as Error).message } });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ success: false, error: { message: 'Email is required' } }); return; }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.isAnonymous) { res.status(404).json({ success: false, error: { message: 'No account found with that email address' } }); return; }
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    res.status(200).json({ success: true, message: 'Password reset token generated', data: { resetToken } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to process forgot password request', details: (error as Error).message } });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) { res.status(400).json({ success: false, error: { message: 'Reset token and new password are required' } }); return; }
    if (newPassword.length < 6) { res.status(400).json({ success: false, error: { message: 'Password must be at least 6 characters long' } }); return; }
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: new Date() } });
    if (!user) { res.status(400).json({ success: false, error: { message: 'Invalid or expired reset token' } }); return; }
    user.password = newPassword; user.resetPasswordToken = undefined; user.resetPasswordExpires = undefined; await user.save();
    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to reset password', details: (error as Error).message } });
  }
};
