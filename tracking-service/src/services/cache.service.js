import { redisClient } from '../config/redis.js';

const LOCATION_TTL_SECONDS = 60 * 60;

const locationKey = (vehicleId) => `vehicle_location:${vehicleId}`;

export const cacheVehicleLocation = async (vehicleId, location) => {
  if (!redisClient?.isOpen) {
    return;
  }

  await redisClient.set(locationKey(vehicleId), JSON.stringify(location), {
    EX: LOCATION_TTL_SECONDS
  });
};

export const getCachedVehicleLocation = async (vehicleId) => {
  if (!redisClient?.isOpen) {
    return null;
  }

  const cachedLocation = await redisClient.get(locationKey(vehicleId));
  return cachedLocation ? JSON.parse(cachedLocation) : null;
};
