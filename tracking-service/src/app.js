import express from 'express';
import alertRoutes from './routes/alert.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tracking-service'
  });
});

app.use('/api/tracking', trackingRoutes);
app.use('/api/tracking/alerts', alertRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
