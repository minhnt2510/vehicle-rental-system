import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import rentalRoutes from './routes/rentalRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.RENTAL_SERVICE_PORT || 3003;
const mongoUri =
  process.env.RENTAL_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rental-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.use('/api/rentals', rentalRoutes);

app.listen(PORT, () => {
  console.log(`Rental Service running on port ${PORT}`);
});
