const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Connection caching for serverless environments (Vercel)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const clientRoutes = require('./routes/client.routes');
const caseRoutes = require('./routes/case.routes');
const billingRoutes = require('./routes/billing.routes');
const messageRoutes = require('./routes/message.routes');
const noticeRoutes = require('./routes/notice.routes');
const caseTypeRoutes = require('./routes/case-type.routes');
const ecourtRoutes = require('./routes/ecourt.routes');

// Initialize Express app
const app = express();

// Middleware - CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [
      'http://localhost:4200',
      'https://leegalms.vercel.app',
      'https://leegalms-o231gmx01-darwin-p-sunnys-projects.vercel.app',
      /^https:\/\/.*\.vercel\.app$/
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Reduced logging in production for performance
    if (isDevelopment) {
      console.log('CORS Request - Origin:', origin || 'No origin header');
    }
    
    // In development, be more permissive
    if (isDevelopment && !origin) {
      return callback(null, true);
    }
    
    // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // In development, allow anyway but log a warning
      if (isDevelopment) {
        console.warn('CORS: Allowing origin in development mode (not in allowed list):', origin);
        return callback(null, true);
      }
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection check middleware (optimized for serverless)
app.use(async (req, res, next) => {
  // Skip database check for health/status endpoints
  if (req.path === '/api/health' || req.path === '/api/status') {
    return next();
  }
  
  // Quick check - if already connected, proceed immediately
  if (mongoose.connection.readyState === 1) {
    return next();
  }
  
  // Only attempt connection if disconnected (not if connecting/disconnecting)
  if (mongoose.connection.readyState === 0) {
    try {
      // Use Promise.race to avoid long waits
      await Promise.race([
        connectDB(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 2000)
        )
      ]);
    } catch (error) {
      // Only log in development, fail fast in production
      if (process.env.NODE_ENV === 'development') {
        console.error('Database connection failed in middleware:', error);
      }
      return res.status(503).json({
        success: false,
        message: 'Database connection unavailable',
        error: 'Service temporarily unavailable'
      });
    }
  } else if (mongoose.connection.readyState === 2) {
    // Connection in progress - wait max 500ms
    const maxWait = 500;
    const start = Date.now();
    while (mongoose.connection.readyState === 2 && (Date.now() - start) < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection timeout',
        error: 'Service temporarily unavailable'
      });
    }
  }
  
  next();
});

// Request logging middleware (reduced in production)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Status endpoint with detailed information
app.get('/api/status', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const status = {
    success: true,
    server: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000
    },
    database: {
      status: dbStates[dbStatus] || 'unknown',
      connected: dbStatus === 1
    },
    version: '1.0.0'
  };

  // If database is not connected, return 503 status
  const httpStatus = dbStatus === 1 ? 200 : 503;
  
  res.status(httpStatus).json(status);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/case-types', caseTypeRoutes);
app.use('/api/ecourt', ecourtRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/legalms';

// MongoDB connection options optimized for serverless (Vercel)
// In serverless (Vercel), we disable buffering. In regular server, we can enable it.
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
const mongooseOptions = {
  serverSelectionTimeoutMS: 2000, // Faster timeout for serverless (2s instead of 5s)
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  connectTimeoutMS: 3000, // Faster connection timeout (3s instead of 10s)
  maxPoolSize: isServerless ? 1 : 10, // Single connection in serverless (better for cold starts)
  minPoolSize: 0, // No minimum pool in serverless
  bufferCommands: !isServerless, // Disable buffering only in serverless environments
  maxIdleTimeMS: 30000, // Close idle connections after 30s
};

async function connectDB() {
  // Return cached connection immediately if available
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // If connection is already in progress, wait for it
  if (cached.promise) {
    try {
      cached.conn = await cached.promise;
      return cached.conn;
    } catch (e) {
      cached.promise = null;
      throw e;
    }
  }

  // Start new connection
  const opts = {
    ...mongooseOptions,
  };
  
  cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Connected to MongoDB');
    }
    return mongoose;
  }).catch((error) => {
    cached.promise = null;
    throw error;
  });
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Connect to database and start server
connectDB()
  .then(() => {
    // Start server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    console.error('MongoDB URI:', MONGODB_URI ? 'Set' : 'NOT SET');
    // Don't exit in serverless - let it retry
    if (process.env.NODE_ENV === 'production') {
      console.error('Continuing without database connection (serverless mode)');
      // Still start the server in production to avoid deployment failures
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT} (without database connection)`);
      });
    } else {
      process.exit(1);
    }
  });

module.exports = app;

