import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import ownerApplicationRoutes from './routes/ownerApplicationRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.USER_SERVICE_PORT || 3001;
const mongoUri =
  process.env.USER_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

// Middleware
app.use(express.json());

// Connect to MongoDB
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/owner-applications', ownerApplicationRoutes);
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'user-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
