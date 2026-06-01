import express from 'express';
import vehicleService from '../services/VehicleService.js';
import { authenticateToken } from '../middlewares/auth.js';
import upload from '../middlewares/upload.js';

const router = express.Router();

function isAdmin(req) {
  return String(req.userRole || '').toUpperCase() === 'ADMIN';
}

function applySearchFiltersFromQuery(query, includeAvailability = false) {
  const filters = {};

  if (query.q) filters.keyword = query.q;
  if (query.vehicle_type) filters.vehicle_type = query.vehicle_type;
  if (query.brand) filters.brand = query.brand;
  if (query.fuel_type) filters.fuel_type = query.fuel_type;
  if (query.transmission) filters.transmission = query.transmission;
  if (query.allowed_region) filters.allowed_region = query.allowed_region;

  const locationTokens = [query.location, query.city, query.district]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (locationTokens.length) {
    const locationRegexes = locationTokens.map((token) => ({ $regex: token, $options: 'i' }));

    const locationConditions = [];
    for (const regex of locationRegexes) {
      locationConditions.push(
        { pickup_location: regex },
        { return_location: regex },
        { city: regex },
        { district: regex },
        { allowed_region: regex }
      );
    }

    filters.$or = locationConditions;
  }

  if (query.min_seats || query.max_seats) {
    filters.seats = {};
    if (query.min_seats) filters.seats.$gte = parseInt(query.min_seats, 10);
    if (query.max_seats) filters.seats.$lte = parseInt(query.max_seats, 10);
  }

  if (query.min_price || query.max_price) {
    filters.daily_rate = {};
    if (query.min_price) filters.daily_rate.$gte = parseInt(query.min_price, 10);
    if (query.max_price) filters.daily_rate.$lte = parseInt(query.max_price, 10);
  }

  if (includeAvailability) {
    if (query.is_available === 'true') filters.is_available = true;
    if (query.is_available === 'false') filters.is_available = false;
  }

  return filters;
}

function parseGeoQuery(query = {}) {
  const latitude = Number.parseFloat(query.latitude ?? query.lat);
  const longitude = Number.parseFloat(query.longitude ?? query.lng);
  const radiusKm = Number.parseFloat(query.radius_km ?? query.radiusKm ?? query.radius);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    radius_km: Number.isFinite(radiusKm) ? radiusKm : 10
  };
}

router.post('/', authenticateToken, upload.fields([{ name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    const vehicle = await vehicleService.createVehicle(
      req.userId,
      {
        ...req.body
      },
      req.files?.images || [],
      req.headers.authorization
    );
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/owner/:ownerId/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sort = req.query.sort || '-created_at';

    const result = await vehicleService.getOwnerVehicles(req.params.ownerId, page, limit, sort);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/available/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sort = req.query.sort || '-created_at';

    const filters = applySearchFiltersFromQuery(req.query, false);
    const geo = parseGeoQuery(req.query);
    const result = geo
      ? await vehicleService.getNearbyVehicles(filters, geo, page, limit)
      : await vehicleService.getAvailableVehicles(filters, page, limit, sort);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/nearby/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const filters = applySearchFiltersFromQuery(req.query, false);
    const geo = parseGeoQuery(req.query);

    if (!geo) {
      return res.status(400).json({
        error: 'Missing latitude/longitude. Example: /nearby/list?lat=10.78&lng=106.70&radius_km=10'
      });
    }

    const result = await vehicleService.getNearbyVehicles(filters, geo, page, limit);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/search/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const sort = req.query.sort || '-created_at';

    const filters = applySearchFiltersFromQuery(req.query, true);
    const result = await vehicleService.searchVehicles(filters, page, limit, sort);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/search/suggestions', async (req, res) => {
  try {
    const keyword = req.query.q || '';
    const limit = parseInt(req.query.limit, 10) || 8;
    const suggestions = await vehicleService.suggestKeywords(keyword, limit);
    res.json({ data: suggestions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/admin/list', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const sort = req.query.sort || '-created_at';
    const filters = applySearchFiltersFromQuery(req.query, true);
    const result = await vehicleService.getAdminVehicles(filters, page, limit, sort);
    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch admin vehicles' });
  }
});

router.get('/:vehicleId', async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.vehicleId);
    res.json(vehicle);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/:vehicleId', authenticateToken, async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.vehicleId);

    if (vehicle.owner_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this vehicle' });
    }

    const updatedVehicle = await vehicleService.updateVehicle(req.params.vehicleId, req.body);
    res.json(updatedVehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:vehicleId/images', authenticateToken, upload.fields([{ name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.vehicleId);

    if (vehicle.owner_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to add images to this vehicle' });
    }

    const updatedVehicle = await vehicleService.addVehicleImages(req.params.vehicleId, req.files);
    res.json(updatedVehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:vehicleId/images/:imageIndex', authenticateToken, async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.vehicleId);

    if (vehicle.owner_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete images from this vehicle' });
    }

    const imageUrl = vehicle.images[parseInt(req.params.imageIndex, 10)];
    if (!imageUrl) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const updatedVehicle = await vehicleService.deleteVehicleImage(req.params.vehicleId, imageUrl);
    res.json(updatedVehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:vehicleId/availability', async (req, res) => {
  try {
    const vehicle = await vehicleService.updateAvailability(req.params.vehicleId, req.body.is_available);
    res.json(vehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:vehicleId/smart-pricing', authenticateToken, async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.vehicleId);

    if (vehicle.owner_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update smart pricing for this vehicle' });
    }

    const { enabled } = req.body;
    const updatedVehicle = await vehicleService.updateVehicle(req.params.vehicleId, {
      smart_pricing_enabled: !!enabled,
    });

    if (enabled) {
      // Trigger async AI pricing update (non-blocking)
      vehicleService.updateSmartPricing(req.params.vehicleId, {
        vehicleType: vehicle.vehicle_type,
        location: vehicle.pickup_location,
        basePrice: vehicle.daily_rate,
      }).catch((err) => console.error('[route] smart pricing update error:', err.message));
    }

    return res.json({ message: `Smart pricing ${enabled ? 'enabled' : 'disabled'}`, vehicle: updatedVehicle });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/:vehicleId', authenticateToken, async (req, res) => {
  try {
    await vehicleService.deleteVehicle(req.params.vehicleId, req.userId, req.headers.authorization);
    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
