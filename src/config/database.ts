import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process?.env?.MONGODB_URI || '';
    
    await mongoose.connect(mongoURI);

    console.log('✅ MongoDB connected successfully',mongoURI);
    
    // Handle connection events
    mongoose.connection.on('error', (error: Error) => {
      console.error('❌ MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });
    
    // Graceful shutdown
    process?.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('📴 MongoDB connection closed due to app termination');
      process?.exit(0);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    console.log('⚠️  Running without database connection - some features may not work');
    
    // Don't exit in development mode, allow API to run without DB
    if (process?.env?.NODE_ENV === 'production') {
      process?.exit(1);
    }
  }
};
