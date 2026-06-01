import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import disputeRoutes from './routes/disputeRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.DISPUTE_SERVICE_PORT || 3008;
const mongoUri =
  process.env.DISPUTE_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dispute-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/api/disputes', disputeRoutes);

app.listen(PORT, () => {
  console.log(`Dispute Service running on port ${PORT}`);
});
