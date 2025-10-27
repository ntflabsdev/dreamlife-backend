import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import { errorHandler, notFound } from './middleware/errorMiddleware';
import { seedSubscriptionPlans } from './seeds/subscriptionSeed';
import { seedKnowledgeBase } from './seeds/knowledgeBaseSeed';
import questionnaireRoutes from './routes/questionnaire';
import contactRoutes from './routes/contact';
import dreamWorldRoutes from './routes/dreamWorld';
import authRoutes from './routes/auth';
import paymentsRoutes from './routes/payments';
import subscriptionRoutes from './routes/subscription';
import { WebSocketChatService } from './services/websocketChatService';

// Load environment variables
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

const app = express();
const server = createServer(app);
const PORT = process?.env?.PORT || 3000;

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
    console.log('⚠️ Server will continue without PayPal plans initialized');
  }
};
initializePayPalPlans();

const initializeKnowledgeBase = async () => {
  try {
    console.log('🌱 Initializing Knowledge Base...');
    await seedKnowledgeBase();
    console.log('✅ Knowledge Base initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Knowledge Base:', error);
  }
};
initializeKnowledgeBase();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process?.env?.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process?.env?.RATE_LIMIT_MAX || '100', 10),
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Optional IP allow list

// CORS configuration
const allowedOrigins = [ 'http://localhost:5173','https://lavisionlife.com/'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Health check
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
      websocket: 'ws://localhost:' + (process?.env?.PORT || 3000)
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

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Initialize WebSocket Chat Service
const webSocketChatService = new WebSocketChatService(server);

// WebSocket stats endpoint (optional - for monitoring)
app.get('/api/chat/stats', (req, res) => {
  res.json({
    connectedClients: webSocketChatService.getConnectedClientsCount(),
    activeSessions: webSocketChatService.getActiveSessionsCount(),
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 DreamLife API server running on port ${PORT}`);
  console.log(`📋 Environment: ${process?.env?.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 WebSocket Chat available at ws://localhost:${PORT}`);
});

export default app;
