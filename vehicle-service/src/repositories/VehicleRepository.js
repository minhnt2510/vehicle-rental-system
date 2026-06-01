import Vehicle from '../models/Vehicle.js';

export class VehicleRepository {
  buildSort(sort = '-created_at') {
    const allowedSort = new Set(['created_at', '-created_at', 'daily_rate', '-daily_rate', 'average_rating', '-average_rating']);
    return allowedSort.has(sort) ? sort : '-created_at';
  }

  toNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async paginateQuery(query, page = 1, limit = 10, sort = '-created_at') {
    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 50);
    const skip = (safePage - 1) * safeLimit;
    const safeSort = this.buildSort(sort);

    const [total, data] = await Promise.all([
      Vehicle.countDocuments(query),
      Vehicle.find(query).sort(safeSort).skip(skip).limit(safeLimit).lean()
    ]);

    return {
      data,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      }
    };
  }

  async create(vehicleData) {
    const vehicle = new Vehicle(vehicleData);
    return await vehicle.save();
  }

  async findById(id) {
    return await Vehicle.findById(id).lean();
  }

  async update(id, updateData) {
    return await Vehicle.findByIdAndUpdate(
      id,
      { ...updateData, updated_at: new Date() },
      { new: true, lean: true }
    );
  }

  async findByOwnerId(ownerId, page = 1, limit = 10, sort = '-created_at') {
    return this.paginateQuery({ owner_id: ownerId }, page, limit, sort);
  }

  async findAvailable(filters = {}, page = 1, limit = 10, sort = '-created_at') {
    const query = { is_available: true, ...filters };
    return this.paginateQuery(query, page, limit, sort);
  }

  async findNearbyAvailable(
    filters = {},
    geo = {},
    page = 1,
    limit = 10
  ) {
    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const latitude = this.toNumber(geo.latitude);
    const longitude = this.toNumber(geo.longitude);
    const radiusKm = this.toNumber(geo.radius_km ?? geo.radiusKm) ?? 10;
    const maxDistance = Math.max(0.1, radiusKm) * 1000;

    if (latitude === null || longitude === null) {
      throw new Error('Missing valid latitude/longitude for nearby search');
    }

    const query = { is_available: true, ...filters };

    const [result] = await Vehicle.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          distanceField: 'distance_meters',
          spherical: true,
          maxDistance,
          query
        }
      },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: safeLimit }],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    const rows = (result?.data || []).map((item) => ({
      ...item,
      distance_meters: Number(item.distance_meters || 0),
      distance_km: Number((Number(item.distance_meters || 0) / 1000).toFixed(2))
    }));

    const total = Number(result?.total?.[0]?.count || 0);

    return {
      data: rows,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit)
      }
    };
  }

  async findAll(filters = {}, page = 1, limit = 10, sort = '-created_at') {
    return this.paginateQuery(filters, page, limit, sort);
  }

  async searchVehicles(filters = {}, keyword = '', page = 1, limit = 10, sort = '-created_at') {
    const query = { ...filters };

    if (keyword && keyword.trim().length > 0) {
      query.$or = [
        { brand: { $regex: keyword.trim(), $options: 'i' } },
        { model: { $regex: keyword.trim(), $options: 'i' } },
        { description: { $regex: keyword.trim(), $options: 'i' } },
        { license_plate: { $regex: keyword.trim(), $options: 'i' } }
      ];
    }

    return this.paginateQuery(query, page, limit, sort);
  }

  async suggestKeywords(keyword = '', limit = 8) {
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 8, 1), 20);
    const q = (keyword || '').trim();

    if (!q) {
      return [];
    }

    const regex = new RegExp(q, 'i');

    const [brands, models] = await Promise.all([
      Vehicle.find({ brand: regex }, { brand: 1, _id: 0 }).limit(safeLimit).lean(),
      Vehicle.find({ model: regex }, { model: 1, _id: 0 }).limit(safeLimit).lean()
    ]);

    const suggestions = new Set();
    for (const b of brands) {
      if (b.brand) {
        suggestions.add(b.brand);
      }
    }
    for (const m of models) {
      if (m.model) {
        suggestions.add(m.model);
      }
    }

    return Array.from(suggestions).slice(0, safeLimit);
  }

  async delete(id) {
    return await Vehicle.findByIdAndDelete(id).lean();
  }
}
