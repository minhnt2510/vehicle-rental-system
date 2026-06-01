import mongoose from 'mongoose';

const rental_request_schema = new mongoose.Schema(
  {
    renter_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Vehicle'
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
      required: true
    },
    images: [String],
    vehicle_snapshot: {
      brand: String,
      model: String,
      license_plate: String,
      vehicle_type: String,
      fuel_type: String,
      transmission: String,
      seats: Number,
      year: Number,
      image: String,
      pickup_location: String,
      return_location: String
    },
    owner_snapshot: {
      name: String,
      email: String,
      phone: String,
      payout_info: {
        method: String,
        bank_name: String,
        bank_code: String,
        bank_account_holder: String,
        bank_account_number: String,
        masked_account_number: String,
        card_brand: String,
        card_last4: String,
        payout_note: String
      }
    },
    renter_snapshot: {
      name: String,
      email: String,
      phone: String
    },
    pricing_snapshot: {
      daily_rate: Number,
      deposit_amount: Number,
      rental_days: Number,
      rental_amount: Number,
      platform_fee: Number,
      total_amount: Number
    },
    rental_start_date: {
      type: Date,
      required: true
    },
    rental_end_date: {
      type: Date,
      required: true
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
    allowed_region: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'APPROVED',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED',
        'ACTIVE',
        'RETURN_REQUESTED',
        'COMPLETED',
        'DISPUTED'
      ],
      default: 'PENDING'
    },
    daily_rate: Number,
    total_days: Number,
    total_amount: Number,
    deposit_amount: Number,
    platform_fee: Number,
    notes: String,
    pickup_confirmed_at: Date,
    return_requested_at: Date,
    completed_at: Date,
    dispute_reason: String,
    booking_saga: {
      saga_id: String,
      status: {
        type: String,
        enum: ['NONE', 'STARTED', 'COMPLETED', 'COMPENSATED', 'FAILED'],
        default: 'NONE'
      },
      current_step: String,
      contract_id: String,
      payment_id: String,
      last_error: String,
      steps: [
        {
          step: String,
          status: String,
          message: String,
          at: {
            type: Date,
            default: Date.now
          }
        }
      ],
      updated_at: Date
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
  { collection: 'rental_requests' }
);

rental_request_schema.index({ renter_id: 1, created_at: -1 });
rental_request_schema.index({ owner_id: 1, created_at: -1 });
rental_request_schema.index({ vehicle_id: 1, status: 1, rental_start_date: 1, rental_end_date: 1 });
rental_request_schema.index({ status: 1, created_at: -1 });
rental_request_schema.index({ created_at: -1 });

export default mongoose.model('RentalRequest', rental_request_schema);
