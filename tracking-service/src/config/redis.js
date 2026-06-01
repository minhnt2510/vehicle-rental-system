import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;
const redisEnabled = Boolean(redisUrl);

export const redisClient = redisEnabled
  ? createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        // Prevent endless reconnect logs in cloud env when Redis is missing.
        reconnectStrategy: () => false
      }
    })
  : null;

if (redisClient) {
  redisClient.on('error', (error) => {
    console.error('Redis error:', error?.message || error);
  });
}

export const connectRedis = async () => {
  if (!redisClient) {
    console.warn('REDIS_URL is missing. Tracking Service continues without Redis cache.');
    return;
  }

  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      console.log('Tracking Service connected to Redis');
    } catch (error) {
      console.warn('Redis unavailable, tracking-service continues without cache:', error.message);
    }
  }
};

export const disconnectRedis = async () => {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
};
