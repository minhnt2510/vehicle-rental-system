import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import imageRoutes from './routes/imageRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.IMAGE_SERVICE_PORT || 3007;

app.use(express.json());
app.use('/uploads', express.static(path.resolve('./uploads')));
app.use('/api/images', imageRoutes);
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'image-service'
  });
});

app.listen(PORT, () => {
  console.log(`Image Service running on port ${PORT}`);
});
