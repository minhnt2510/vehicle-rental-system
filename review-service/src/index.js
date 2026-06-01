import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import reviewRoutes from './routes/reviewRoutes.js';
import Review from './models/Review.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.REVIEW_SERVICE_PORT || 3009;
const mongoUri =
  process.env.REVIEW_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('Connected to MongoDB');
    try {
      await Review.syncIndexes();
    } catch (error) {
      console.log('Review index sync warning:', error.message);
    }
  })
  .catch(err => console.log('MongoDB connection error:', err));

app.use('/api/reviews', reviewRoutes);
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'review-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.listen(PORT, () => {
  console.log(`Review Service running on port ${PORT}`);
});
