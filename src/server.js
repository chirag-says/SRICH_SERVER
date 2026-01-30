const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// CORS Configuration - Allow all origins for API
app.use(cors({
  origin: true,  // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/clinical-cases', require('./routes/clinicalCase.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/leave-requests', require('./routes/leaveRequest.routes'));
app.use('/api/statistics', require('./routes/statistics.routes'));
app.use('/api/professor', require('./routes/professor.routes'));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'SRISH Clinical Management API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🏥 SRISH Server running on port ${PORT}`);
});
