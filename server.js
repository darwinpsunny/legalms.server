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
      'https://leegalms-o231gmx01-darwin-p-sunnys-projects.vercel.app',
      /^https:\/\/.*\.vercel\.app$/
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Log the origin for debugging
    console.log('CORS Request - Origin:', origin || 'No origin header');
    console.log('CORS Request - Environment:', isDevelopment ? 'development' : 'production');
    
    // In development, be more permissive
    if (isDevelopment && !origin) {
      console.log('CORS: Allowing request with no origin (development mode)');
      return callback(null, true);
    }
    
    // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
    if (!origin) {
      console.log('CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        const matches = origin === allowedOrigin;
        if (matches) console.log(`CORS: Matched string origin: ${allowedOrigin}`);
        return matches;
      } else if (allowedOrigin instanceof RegExp) {
        const matches = allowedOrigin.test(origin);
        if (matches) console.log(`CORS: Matched regex origin: ${allowedOrigin}`);
        return matches;
      }
      return false;
    });
    
    if (isAllowed) {
      console.log('CORS: Allowing origin:', origin);
      callback(null, true);
    } else {
      console.log('CORS: Blocking origin:', origin);
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

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log('Request Headers:', {
    origin: req.headers.origin,
    referer: req.headers.referer,
    'user-agent': req.headers['user-agent']
  });
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

// MongoDB connection options for serverless environments
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10s
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
  bufferCommands: false, // Disable mongoose buffering
};

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      ...mongooseOptions,
    };
    
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('Connected to MongoDB');
      console.log('MongoDB URI:', MONGODB_URI ? 'Set' : 'NOT SET');
      return mongoose;
    });
  }
  
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

