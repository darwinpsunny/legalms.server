const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

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

// Database connection middleware - ensures connection is ready before processing API requests
app.use('/api', async (req, res, next) => {
  // Skip database check for health/status endpoints
  if (req.path === '/health' || req.path === '/status') {
    return next();
  }

  // Fast path: if already connected, proceed immediately
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  // If disconnected, try to connect
  if (mongoose.connection.readyState === 0) {
    try {
      await connectToDatabase();
      return next();
    } catch (error) {
      return res.status(503).json({
        success: false,
        message: 'Database connection unavailable',
        error: 'Service temporarily unavailable. Please try again in a moment.',
      });
    }
  }

  // If connecting, wait briefly (max 2 seconds)
  if (mongoose.connection.readyState === 2) {
    const maxWait = 2000;
    const start = Date.now();
    
    while (mongoose.connection.readyState === 2 && (Date.now() - start) < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (mongoose.connection.readyState === 1) {
      return next();
    }

    return res.status(503).json({
      success: false,
      message: 'Database connection timeout',
      error: 'Service temporarily unavailable. Please try again in a moment.',
    });
  }

  // If disconnecting or unknown state, return error
  return res.status(503).json({
    success: false,
    message: 'Database connection unavailable',
    error: 'Service temporarily unavailable',
  });
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

// ============================================================================
// MongoDB Connection Configuration
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/legalms';
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
const isProduction = process.env.NODE_ENV === 'production';

// Connection cache for serverless environments (Vercel)
let connectionCache = global.mongoose;
if (!connectionCache) {
  connectionCache = global.mongoose = { conn: null, promise: null };
}

/**
 * Get MongoDB connection options based on environment
 */
function getConnectionOptions() {
  const baseOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    retryReads: true,
  };

  // Serverless-specific options
  if (isServerless) {
    return {
      ...baseOptions,
      maxPoolSize: 1,
      minPoolSize: 0,
      bufferCommands: false, // Critical for serverless
    };
  }

  // Regular server options
  return {
    ...baseOptions,
    maxPoolSize: 10,
    minPoolSize: 1,
    bufferCommands: true,
  };
}

/**
 * Setup MongoDB connection event handlers
 */
function setupConnectionHandlers() {
  mongoose.connection.on('connected', () => {
    console.log('✓ MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('✗ MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('⚠ MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✓ MongoDB reconnected');
  });
}

/**
 * Validate MongoDB connection string
 */
function validateConnectionString() {
  if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017/legalms') {
    if (isProduction) {
      console.warn('⚠ MONGODB_URI not set - using default (may not work in production)');
    }
    return false;
  }
  return true;
}

/**
 * Get helpful error message based on error type
 */
function getErrorMessage(error) {
  const errorType = error.constructor.name;
  const errorMessage = error.message;

  if (errorMessage.includes('timeout') || errorType === 'MongoNetworkTimeoutError') {
    return {
      title: 'Connection Timeout',
      suggestions: [
        'MongoDB Atlas Network Access: Whitelist Vercel IPs (or use 0.0.0.0/0 for testing)',
        'Verify MONGODB_URI environment variable is correct',
        'Check MongoDB Atlas cluster status',
        'Ensure network firewall allows connections',
      ],
    };
  }

  if (errorMessage.includes('authentication') || errorType === 'MongoAuthenticationError') {
    return {
      title: 'Authentication Failed',
      suggestions: [
        'Verify username and password in connection string',
        'Check database user permissions in MongoDB Atlas',
        'Ensure user has access to the specified database',
      ],
    };
  }

  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('DNS')) {
    return {
      title: 'DNS Resolution Failed',
      suggestions: [
        'Check MongoDB connection string format',
        'Verify cluster hostname is correct',
        'Ensure network connectivity',
      ],
    };
  }

  return {
    title: 'Connection Error',
    suggestions: [
      'Check MongoDB connection string',
      'Verify network connectivity',
      'Review MongoDB Atlas logs',
    ],
  };
}

/**
 * Connect to MongoDB with caching for serverless environments
 */
async function connectToDatabase() {
  // Return cached connection if available and connected
  if (connectionCache.conn && mongoose.connection.readyState === 1) {
    return connectionCache.conn;
  }

  // If connection is in progress, wait for it
  if (connectionCache.promise) {
    try {
      connectionCache.conn = await connectionCache.promise;
      return connectionCache.conn;
    } catch (error) {
      connectionCache.promise = null;
      throw error;
    }
  }

  // Validate connection string
  const isValid = validateConnectionString();
  if (!isValid && isProduction) {
    throw new Error('MONGODB_URI environment variable is required in production');
  }

  // Get connection options
  const options = getConnectionOptions();
  
  // Add TLS options for Atlas SRV connections
  if (MONGODB_URI.includes('mongodb+srv://')) {
    options.tls = true;
    options.tlsAllowInvalidCertificates = false;
  }

  // Log connection attempt
  const connectionType = MONGODB_URI.includes('mongodb+srv://') ? 'Atlas (SRV)' : 'Standard';
  console.log(`Connecting to MongoDB (${connectionType})...`);

  // Create connection promise
  connectionCache.promise = mongoose
    .connect(MONGODB_URI, options)
    .then((mongooseInstance) => {
      const dbName = mongooseInstance.connection.db?.databaseName || 'unknown';
      console.log(`✓ Connected to MongoDB: ${dbName}`);
      connectionCache.conn = mongooseInstance;
      return mongooseInstance;
    })
    .catch((error) => {
      connectionCache.promise = null;
      
      // Log detailed error information
      const errorInfo = getErrorMessage(error);
      console.error(`✗ MongoDB connection failed: ${errorInfo.title}`);
      console.error(`Error: ${error.message}`);
      
      if (isProduction) {
        console.error('\nTroubleshooting suggestions:');
        errorInfo.suggestions.forEach((suggestion, index) => {
          console.error(`  ${index + 1}. ${suggestion}`);
        });
      }
      
      throw error;
    });

  try {
    connectionCache.conn = await connectionCache.promise;
    return connectionCache.conn;
  } catch (error) {
    connectionCache.promise = null;
    throw error;
  }
}

/**
 * Initialize database connection and start server
 */
async function initializeServer() {
  try {
    // Setup connection event handlers
    setupConnectionHandlers();
    
    // Connect to database
    await connectToDatabase();
    
    // Start Express server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Serverless: ${isServerless ? 'Yes' : 'No'}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error.message);
    
    // In production/serverless, start server anyway to avoid deployment failures
    // Routes will handle database errors gracefully
    if (isProduction || isServerless) {
      console.warn('⚠ Starting server without database connection (serverless mode)');
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => {
        console.log(`⚠ Server running on port ${PORT} (database unavailable)`);
      });
    } else {
      // In development, exit on connection failure
      console.error('Exiting due to database connection failure');
      process.exit(1);
    }
  }
}

// Initialize server
initializeServer();

module.exports = app;

