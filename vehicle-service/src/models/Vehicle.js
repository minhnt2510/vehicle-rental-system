import mongoose from 'mongoose';
import { resolveCoordinates, toGeoPoint } from '../constants/geoLocation.js';

const vehicle_schema = new mongoose.Schema(
  {
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    vehicle_type: {
      type: String,
      enum: ['CAR', 'MOTORCYCLE', 'BICYCLE', 'PICKUP_TRUCK', 'SEVEN_SEATER', 'OTHER'],
      required: true
    },
    brand: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    license_plate: {
      type: String,
      required: true,
      unique: true
    },
    color: String,
    transmission: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC', 'NONE']
    },
    fuel_type: {
      type: String,
      enum: ['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID']
    },
    seats: Number,
    description: String,
    images: [String],
    daily_rate: {
      type: Number,
      required: true
    },
    deposit_amount: {
      type: Number,
      required: true
    },
    allowed_region: {
      type: String,
      enum: ['VIETNAM', 'INTERNATIONAL', 'TP_HCM', 'HA_NOI', 'DA_NANG', 'OTHER']
    },
    pickup_location: {
      type: String,
      required: true
    },
    return_location: {
      type: String,
      required: true
    },
    city: {
      type: String,
      default: ''
    },
    district: {
      type: String,
      default: ''
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    geo_location: {
      type: {
        type: String,
        enum: ['Point'],
        default: undefined
      },
      coordinates: {
        type: [Number],
        default: undefined
      }
    },
    is_available: {
      type: Boolean,
      default: true
    },
    registration_number: String,
    registration_expiry: Date,
    insurance_number: String,
    insurance_expiry: Date,
    total_rentals: {
      type: Number,
      default: 0
    },
    average_rating: {
      type: Number,
      default: 5.0
    },
    // ---- AI Smart Pricing ----
    smart_pricing_enabled: {
      type: Boolean,
      default: false
    },
    suggested_price: {
      type: Number,
      default: null
    },
    suggested_price_reason: {
      type: String,
      default: null
    },
    ai_pricing_updated_at: {
      type: Date,
      default: null
    },
    // ---- AI Trust Score ----
    trust_score: {
      type: Number,
      default: null
    },
    trust_score_level: {
      type: String,
      default: null
    },
    trust_score_explanation: {
      type: String,
      default: null
    },
    trust_score_updated_at: {
      type: Date,
      default: null
    },
    // ---- AI Review Summary ----
    ai_review_summary: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    ai_review_summary_updated_at: {
      type: Date,
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  { collection: 'vehicles' }
);

// Add indexes for frequently searched fields
vehicle_schema.index({ owner_id: 1 });
vehicle_schema.index({ is_available: 1 });
vehicle_schema.index({ vehicle_type: 1 });
vehicle_schema.index({ brand: 1 });
vehicle_schema.index({ daily_rate: 1 });
vehicle_schema.index({ city: 1, district: 1 });
vehicle_schema.index({ pickup_location: 1 });
vehicle_schema.index({ geo_location: '2dsphere' });
vehicle_schema.index({ created_at: -1 });

vehicle_schema.pre('validate', function beforeValidate(next) {
  const resolved = resolveCoordinates({
    city: this.city,
    district: this.district,
    pickup_location: this.pickup_location,
    return_location: this.return_location,
    allowed_region: this.allowed_region,
    latitude: this.latitude,
    longitude: this.longitude
  });

  if (resolved) {
    this.latitude = resolved.latitude;
    this.longitude = resolved.longitude;
    this.geo_location = toGeoPoint(resolved);
  }

  next();
});

export default mongoose.model('Vehicle', vehicle_schema);
