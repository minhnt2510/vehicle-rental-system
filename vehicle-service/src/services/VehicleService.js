import { VehicleRepository } from '../repositories/VehicleRepository.js';
import { createClient } from 'redis';
import axios from 'axios';
import FormData from 'form-data';
import mongoose from 'mongoose';
import { requestSmartPricing, requestTrustScore } from './aiClient.js';
import { resolveCoordinates, toGeoPoint } from '../constants/geoLocation.js';

const vehicleRepository = new VehicleRepository();
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 2000,
    // Do not block service startup when Redis is down.
    reconnectStrategy: () => false,
  },
});
const CACHE_TTL_SECONDS = Number.parseInt(process.env.VEHICLE_CACHE_TTL || '120', 10);
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'internal-service-token';

redisClient.on('error', (err) => console.log('Redis Client Error', err.message));

async function initRedis() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.log('Redis unavailable, continue without cache:', error.message);
  }
}

void initRedis();

export class VehicleService {
  buildOwnerPayload(user = null) {
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      bank_name: user.bank_name || user.payout_info?.bank_name || '',
      bank_code: user.bank_code || user.payout_info?.bank_code || '',
      bank_account_holder:
        user.bank_account_holder || user.payout_info?.bank_account_holder || '',
      bank_account_number:
        user.bank_account_number || user.payout_info?.bank_account_number || '',
      owner_status: user.owner_status || 'NONE',
      payout_info: user.payout_info || {}
    };
  }

  async findOwnersByIds(ownerIds = []) {
    const normalizedIds = Array.from(
      new Set(
        ownerIds
          .map((value) => String(value || ''))
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
      )
    );
    if (!normalizedIds.length) return [];

    try {
      const response = await axios.post(
        `${USER_SERVICE_URL}/api/users/internal/summaries`,
        { ids: normalizedIds },
        {
          headers: {
            'X-Service-Token': SERVICE_TOKEN
          }
        }
      );
      const rows = response?.data?.data;
      if (Array.isArray(rows)) {
        return rows;
      }
    } catch (error) {
      console.log('Fetch owners via user-service failed, fallback to local query:', error.message);
    }

    const objectIds = normalizedIds.map((value) => new mongoose.Types.ObjectId(value));
    return mongoose.connection
      .collection('users')
      .find(
        { _id: { $in: objectIds } },
        {
          projection: {
            _id: 1,
            email: 1,
            first_name: 1,
            last_name: 1,
            phone: 1,
            bank_name: 1,
            bank_code: 1,
            bank_account_holder: 1,
            bank_account_number: 1,
            owner_status: 1,
            payout_info: 1
          }
        }
      )
      .toArray();
  }

  normalizeVehicleType(value) {
    const raw = String(value || '').toUpperCase();
    if (!raw) return '';
    if (raw === 'MOTORBIKE') return 'MOTORCYCLE';
    if (raw === 'SEVEN_SEAT_CAR' || raw === '7_SEAT_CAR') return 'SEVEN_SEATER';
    if (raw === 'MINI_TRUCK') return 'OTHER';
    if (raw === 'SUV' || raw === 'LUXURY_CAR' || raw === 'SELF_DRIVE_CAR' || raw === 'WITH_DRIVER_CAR' || raw === 'ELECTRIC_BIKE' || raw === 'MOUNTAIN_BIKE') return 'CAR';
    return raw;
  }

  normalizeVehiclePayload(vehicleData = {}) {
    const next = { ...vehicleData };
    if (next.vehicle_type) {
      next.vehicle_type = this.normalizeVehicleType(next.vehicle_type);
    }

    const resolved = resolveCoordinates(next);
    if (resolved) {
      next.latitude = resolved.latitude;
      next.longitude = resolved.longitude;
      next.geo_location = toGeoPoint(resolved);
    }

    return next;
  }

  cacheEnabled() {
    return redisClient?.isOpen;
  }

  buildListCacheKey(prefix, payload) {
    return `${prefix}:${JSON.stringify(payload)}`;
  }

  async getFromCache(key) {
    if (!this.cacheEnabled()) {
      return null;
    }

    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      console.log('Redis get cache error:', err.message);
      return null;
    }
  }

  async setCache(key, data, ttl = CACHE_TTL_SECONDS) {
    if (!this.cacheEnabled()) {
      return;
    }

    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (err) {
      console.log('Redis set cache error:', err.message);
    }
  }

  async invalidateVehicleCaches() {
    if (!this.cacheEnabled()) {
      return;
    }

    try {
      const keys = [];
      for await (const key of redisClient.scanIterator({
        MATCH: 'vehicles:*',
        COUNT: 100
      })) {
        keys.push(key);
      }

      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (err) {
      console.log('Redis invalidate cache error:', err.message);
    }
  }

  normalizeImageFiles(files) {
    if (!files) {
      return [];
    }

    if (Array.isArray(files)) {
      return files;
    }

    return files.images || [];
  }

  async createVehicle(userId, vehicleData, files, authToken) {
    const imageFiles = this.normalizeImageFiles(files);
    if (imageFiles.length === 0) {
      throw new Error('Missing required image files');
    }

    try {
      const uploadedUrls = [];
      for (const file of imageFiles) {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });
        const response = await axios.post(`${process.env.IMAGE_SERVICE_URL}/api/images/upload`, formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': authToken
          }
        });
        uploadedUrls.push(response.data.data.url);
      }

      const normalizedVehicleData = this.normalizeVehiclePayload(vehicleData);
      const vehicle = await vehicleRepository.create({ ...normalizedVehicleData, owner_id: userId, images: uploadedUrls });
      await this.invalidateVehicleCaches();

      // After creation, request smart pricing asynchronously (non-blocking)
      if (normalizedVehicleData.smart_pricing_enabled) {
        this.updateSmartPricing(vehicle._id.toString(), {
          vehicleType: vehicle.vehicle_type,
          location: vehicle.pickup_location,
          basePrice: vehicle.daily_rate,
        }).catch((err) => console.error('[VehicleService] Smart pricing update failed:', err.message));
      }

      return vehicle;
    } catch (error) {
      const upstream = error.response
        ? ` status=${error.response.status} body=${JSON.stringify(error.response.data)}`
        : '';
      console.log(`Create vehicle upload error:${upstream || ` ${error.message}`}`);
      throw new Error(`Failed to create vehicle: ${error.message}`);
    }
  }

  /**
   * Call ai-service to get smart pricing and update the vehicle document.
   */
  async updateSmartPricing(vehicleId, { vehicleType, location, basePrice }) {
    const result = await requestSmartPricing({ vehicleId, vehicleType, location, basePrice });
    if (!result) return; // ai-service failed, keep base price

    await vehicleRepository.update(vehicleId, {
      suggested_price: result.suggestedPrice,
      suggested_price_reason: result.reason,
      ai_pricing_updated_at: new Date(),
    });
    console.log(`[VehicleService] Smart pricing updated for vehicle ${vehicleId}: ${result.suggestedPrice}`);
  }

  /**
   * Call ai-service to calculate trust score and update the vehicle document.
   */
  async updateTrustScore(vehicleId, ownerId) {
    const result = await requestTrustScore(vehicleId, ownerId);
    if (!result) return;

    await vehicleRepository.update(vehicleId, {
      trust_score: result.trustScore,
      trust_score_level: result.level,
      trust_score_explanation: result.explanation,
      trust_score_updated_at: new Date(),
    });
    console.log(`[VehicleService] Trust score updated for vehicle ${vehicleId}: ${result.trustScore}`);
  }

  async getVehicleById(vehicleId) {
    const cacheKey = `vehicles:detail:${vehicleId}`;

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const vehicle = await vehicleRepository.findById(vehicleId);

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const ownerRows = await this.findOwnersByIds([vehicle.owner_id]);
    const owner = this.buildOwnerPayload(ownerRows[0] || null);
    const enrichedVehicle = {
      ...vehicle,
      owner
    };

    await this.setCache(cacheKey, enrichedVehicle, 3600);
    return enrichedVehicle;
  }

  async updateVehicle(vehicleId, updateData) {
    const normalizedUpdateData = this.normalizeVehiclePayload(updateData);
    const vehicle = await vehicleRepository.update(vehicleId, normalizedUpdateData);

    await this.setCache(`vehicles:detail:${vehicleId}`, vehicle, 3600);
    await this.invalidateVehicleCaches();

    return vehicle;
  }

  async getOwnerVehicles(ownerId, page = 1, limit = 10, sort = '-created_at') {
    return await vehicleRepository.findByOwnerId(ownerId, page, limit, sort);
  }

  async getAvailableVehicles(filters = {}, page = 1, limit = 10, sort = '-created_at') {
    const keyword = filters.keyword || '';
    const cleanFilters = this.normalizeVehiclePayload({ ...filters });
    delete cleanFilters.keyword;

    const cacheKey = this.buildListCacheKey('vehicles:list:available', {
      filters: cleanFilters,
      keyword,
      page,
      limit,
      sort
    });

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const result = keyword
      ? await vehicleRepository.searchVehicles({ is_available: true, ...cleanFilters }, keyword, page, limit, sort)
      : await vehicleRepository.findAvailable(cleanFilters, page, limit, sort);

    await this.setCache(cacheKey, result);
    return result;
  }

  async searchVehicles(filters = {}, page = 1, limit = 10, sort = '-created_at') {
    const keyword = filters.keyword || '';
    const cleanFilters = this.normalizeVehiclePayload({ ...filters });
    delete cleanFilters.keyword;

    const cacheKey = this.buildListCacheKey('vehicles:list:search', {
      filters: cleanFilters,
      keyword,
      page,
      limit,
      sort
    });

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const result = keyword
      ? await vehicleRepository.searchVehicles(cleanFilters, keyword, page, limit, sort)
      : await vehicleRepository.findAll(cleanFilters, page, limit, sort);

    await this.setCache(cacheKey, result);
    return result;
  }

  async getNearbyVehicles(filters = {}, geo = {}, page = 1, limit = 10) {
    const cleanFilters = this.normalizeVehiclePayload({ ...filters });
    delete cleanFilters.keyword;

    const cacheKey = this.buildListCacheKey('vehicles:list:nearby', {
      filters: cleanFilters,
      geo: {
        latitude: geo.latitude,
        longitude: geo.longitude,
        radius_km: geo.radius_km ?? geo.radiusKm ?? 10
      },
      page,
      limit
    });

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await vehicleRepository.findNearbyAvailable(cleanFilters, geo, page, limit);
    await this.setCache(cacheKey, result);
    return result;
  }

  async suggestKeywords(keyword, limit = 8) {
    const cacheKey = this.buildListCacheKey('vehicles:suggest', { keyword, limit });
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const suggestions = await vehicleRepository.suggestKeywords(keyword, limit);
    await this.setCache(cacheKey, suggestions);
    return suggestions;
  }

  async getAdminVehicles(filters = {}, page = 1, limit = 50, sort = '-created_at') {
    const keyword = filters.keyword || '';
    const cleanFilters = this.normalizeVehiclePayload({ ...filters });
    delete cleanFilters.keyword;

    const cacheKey = this.buildListCacheKey('vehicles:list:admin', {
      filters: cleanFilters,
      keyword,
      page,
      limit,
      sort
    });

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const result = keyword
      ? await vehicleRepository.searchVehicles(cleanFilters, keyword, page, limit, sort)
      : await vehicleRepository.findAll(cleanFilters, page, limit, sort);

    const ownerIds = Array.from(
      new Set(
        (result?.data || [])
          .map((item) => String(item?.owner_id || ''))
          .filter(Boolean)
      )
    );

    if (ownerIds.length) {
      const users = await this.findOwnersByIds(ownerIds);

      const ownerMap = new Map(
        users.map((user) => [
          String(user._id),
          this.buildOwnerPayload(user)
        ])
      );

      result.data = (result.data || []).map((vehicle) => ({
        ...vehicle,
        owner: ownerMap.get(String(vehicle.owner_id || '')) || null
      }));
    }

    await this.setCache(cacheKey, result, 30);
    return result;
  }

  async deleteVehicle(vehicleId, userId, authToken) {
    const vehicle = await this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }
    if(vehicle.owner_id.toString() !== userId) {
      throw new Error('Not authorized to delete this vehicle');
    }
    if (vehicle.images && vehicle.images.length > 0) {
      for (const imageUrl of vehicle.images) {
        try {
          await axios.delete(`${process.env.IMAGE_SERVICE_URL}/api/images/delete`, {
            data: { imageUrl },
            headers: {
              'Authorization': authToken
            }
          });
        } catch (err) {
          console.log('Error deleting image from service:', err.message);
        }
      }
    }
    const deleted = await vehicleRepository.delete(vehicleId);
    await this.invalidateVehicleCaches();
    if (this.cacheEnabled()) {
      try {
        await redisClient.del(`vehicles:detail:${vehicleId}`);
      } catch (err) {
        console.log('Redis detail cache delete error:', err.message);
      }
    }
    return deleted;
  }

  async addVehicleImages(vehicleId, files) {
    const vehicle = await vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const imageFiles = this.normalizeImageFiles(files);
    if (imageFiles.length === 0) {
      throw new Error('No image files provided');
    }

    try {
      const imageServiceUrl = process.env.IMAGE_SERVICE_URL || `http://localhost:${process.env.IMAGE_SERVICE_PORT || 3005}`;
      const uploadedUrls = [];

      // Upload each file to image-service
      for (const file of imageFiles) {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });

        const response = await axios.post(`${imageServiceUrl}/api/images/upload`, formData, {
          headers: {
            ...formData.getHeaders(),
            'X-Service-Token': process.env.SERVICE_TOKEN || ''
          }
        });

        uploadedUrls.push(response.data.data.url);
      }

      // Update vehicle with new images
      const updatedImages = [...(vehicle.images || []), ...uploadedUrls];
      const updatedVehicle = await this.updateVehicle(vehicleId, { images: updatedImages });

      return updatedVehicle;
    } catch (error) {
      const upstream = error.response
        ? ` status=${error.response.status} body=${JSON.stringify(error.response.data)}`
        : '';
      console.log(`Add vehicle images error:${upstream || ` ${error.message}`}`);
      throw new Error(`Failed to upload vehicle images: ${error.message}`);
    }
  }

  async deleteVehicleImage(vehicleId, imageUrl) {
    const vehicle = await vehicleRepository.findById(vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    try {
      const imageServiceUrl = process.env.IMAGE_SERVICE_URL || `http://localhost:${process.env.IMAGE_SERVICE_PORT || 3005}`;

      // Delete image from image-service
      await axios.delete(`${imageServiceUrl}/api/images/delete`, {
        data: { imageUrl },
        headers: {
          'X-Service-Token': process.env.SERVICE_TOKEN || ''
        }
      });

      // Remove from vehicle's image list
      const updatedImages = (vehicle.images || []).filter(img => img !== imageUrl);
      const updatedVehicle = await this.updateVehicle(vehicleId, { images: updatedImages });

      return updatedVehicle;
    } catch (error) {
      const upstream = error.response
        ? ` status=${error.response.status} body=${JSON.stringify(error.response.data)}`
        : '';
      console.log(`Delete vehicle image error:${upstream || ` ${error.message}`}`);
      throw new Error(`Failed to delete vehicle image: ${error.message}`);
    }
  }

  async updateAvailability(vehicleId, isAvailable) {
    const vehicle = await this.updateVehicle(vehicleId, { is_available: isAvailable });
    await this.invalidateVehicleCaches();
    return vehicle;
  }
}

export default new VehicleService();
