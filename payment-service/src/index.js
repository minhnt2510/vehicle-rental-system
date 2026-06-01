import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import paymentRoutes from './routes/paymentRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.PAYMENT_SERVICE_PORT || 3005;
const mongoUri =
  process.env.PAYMENT_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'payment-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/api/payments', paymentRoutes);

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});
