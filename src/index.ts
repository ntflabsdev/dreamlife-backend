import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { errorHandler, notFound } from './middleware/errorMiddleware';
import { seedSubscriptionPlans } from './seeds/subscriptionSeed';
import questionnaireRoutes from './routes/questionnaire';
import contactRoutes from './routes/contact';
import dreamWorldRoutes from './routes/dreamWorld';
import userRoutes from './routes/user';
import authRoutes from './routes/auth';
import paymentsRoutes from './routes/payments';
import subscriptionRoutes from './routes/subscription';
import { ipAllowList } from './middleware/ipAllowList';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process?.env?.PORT || 3000;

// Trust first proxy (needed for ngrok / reverse proxies so rate limiting & IP works)
// Adjust the number or use true if multiple proxy hops are expected.
app.set('trust proxy', 1);

// Connect to database
connectDB();

// Initialize PayPal subscription plans
const initializePayPalPlans = async () => {
  try {
    console.log('🌱 Initializing PayPal subscription plans...');
    await seedSubscriptionPlans();
    console.log('✅ PayPal subscription plans initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize PayPal subscription plans:', error);
    // Don't exit the server if PayPal initialization fails
    console.log('⚠️ Server will continue without PayPal plans initialized');
  }
};

// Initialize PayPal plans after database connection
initializePayPalPlans();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process?.env?.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process?.env?.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Optional IP allow list (configure ALLOWED_IPS env to enable)
app.use(ipAllowList);

// CORS configuration
const allowedOrigins = process?.env?.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process?.env?.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'DreamLife API is running',
    timestamp: new Date().toISOString(),
    environment: process?.env?.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'DreamLife API',
    version: process.env.npm_package_version || '1.0.0',
    docs: '/health',
    routes: {
      auth: '/api/auth',
      subscription: '/api/subscription',
      payments: '/api/payments',
      questionnaire: '/api/questionnaire',
      dreamWorld: '/api/dream-world',
      contact: '/api/contact',
      users: '/api/users'
    },
    uptimeSeconds: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/questionnaire', questionnaireRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/dream-world', dreamWorldRoutes);
app.use('/api/users', userRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DreamLife API server running on port ${PORT}`);
  console.log(`📋 Environment: ${process?.env?.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;
