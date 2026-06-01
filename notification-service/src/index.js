import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import notificationRoutes from './routes/notificationRoutes.js';
import notificationService from './services/NotificationService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.NOTIFICATION_SERVICE_PORT || 3010;
const mongoUri =
  process.env.NOTIFICATION_MONGO_URI ||
  process.env.MONGO_URI ||
  process.env.MONGODB_URI;

app.use(express.json());

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

app.use('/api/notifications', notificationRoutes);
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-service',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

notificationService.subscribeToEvents();

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});
