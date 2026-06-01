import axios from 'axios';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { EventBus } from '../events/EventBus.js';
import { RentalRepository } from '../repositories/RentalRepository.js';

const rentalRepository = new RentalRepository();
const eventBus = new EventBus();
const CONTRACT_SERVICE_URL = process.env.CONTRACT_SERVICE_URL || 'http://localhost:3004';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3005';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'internal-service-token';
const SAGA_MAX_RETRY = Number.parseInt(process.env.SAGA_MAX_RETRY || '2', 10);
const SAGA_RETRY_DELAY_MS = Number.parseInt(process.env.SAGA_RETRY_DELAY_MS || '3000', 10);

const RENTAL_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  ACTIVE: 'ACTIVE',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED'
};

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function upper(value) {
  return String(value || '').toUpperCase();
}

function parseDateOnly(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  return new Date(year, month - 1, day);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function startOfTomorrow() {
  const tomorrow = startOfToday();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function buildVehicleLocationSnapshot(vehicle = {}) {
  const cityDistrict = [vehicle.district, vehicle.city].filter(Boolean).join(', ');
  const pickupLocation =
    vehicle.pickup_location || cityDistrict || vehicle.allowed_region || 'Chưa cập nhật';
  const returnLocation = vehicle.return_location || pickupLocation;

  return {
    pickup_location: pickupLocation,
    return_location: returnLocation,
    city: vehicle.city || '',
    district: vehicle.district || '',
    allowed_region: vehicle.allowed_region || ''
  };
}

function getDisplayName(user = {}) {
  const fullName = [user.last_name, user.first_name].filter(Boolean).join(' ').trim();
  return fullName || user.full_name || user.name || 'Chưa cập nhật';
}

function maskAccountNumber(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `•••• ${digits.slice(-4)}`;
  }
  return text.length > 4 ? `•••• ${text.slice(-4)}` : text;
}

function buildPayoutSnapshot(owner = {}) {
  const payout = owner.payout_info || {};
  const bankAccountNumber = payout.bank_account_number || owner.bank_account_number || '';
  const masked =
    payout.masked_account_number ||
    payout.maskedAccountNumber ||
    maskAccountNumber(bankAccountNumber);

  return {
    method: payout.method || 'BANK',
    bank_name: payout.bank_name || owner.bank_name || '',
    bank_account_holder: payout.bank_account_holder || owner.bank_account_holder || '',
    bank_account_number: bankAccountNumber,
    masked_account_number: masked,
    bank_code: payout.bank_code || owner.bank_code || '',
    card_brand: payout.card_brand || '',
    card_last4: payout.card_last4 || '',
    payout_note: payout.payout_note || ''
  };
}

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return value;
}

function normalizeDayStart(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RentalService {
  async fetchUserProfile(userId) {
    try {
      const user = await mongoose.connection.collection('users').findOne(
        { _id: toObjectId(userId) },
        {
          projection: {
            _id: 1,
            first_name: 1,
            last_name: 1,
            full_name: 1,
            email: 1,
            phone: 1,
            bank_name: 1,
            bank_code: 1,
            bank_account_number: 1,
            bank_account_holder: 1,
            payout_info: 1
          }
        }
      );
      return user || null;
    } catch {
      return null;
    }
  }

  async fetchVehicle(vehicleId) {
    try {
      const vehicleRes = await axios.get(
        `${process.env.VEHICLE_SERVICE_URL}/api/vehicles/${vehicleId}`
      );
      return vehicleRes?.data?.data || vehicleRes?.data || null;
    } catch (error) {
      if (error?.response?.status === 404) {
        throw makeError('Vehicle not found', 404);
      }
      throw makeError('Vehicle service unavailable, please try again later', 503);
    }
  }

  async updateVehicleAvailability(vehicleId, isAvailable) {
    try {
      await axios.put(
        `${process.env.VEHICLE_SERVICE_URL}/api/vehicles/${vehicleId}/availability`,
        { is_available: Boolean(isAvailable) }
      );
    } catch (error) {
      console.log('Update vehicle availability failed:', error.message);
    }
  }

  async syncContractStatusByRental(rentalId, status, extra = {}) {
    try {
      await mongoose.connection.collection('contracts').updateOne(
        { rental_request_id: toObjectId(rentalId) },
        { $set: { status, ...extra, updated_at: new Date() } }
      );
    } catch (error) {
      console.log('Sync contract status failed:', error.message);
    }
  }

  buildSagaStep(step, status, message) {
    return {
      step,
      status,
      message,
      at: new Date()
    };
  }

  async updateSagaState(rentalId, baseSaga, patch = {}) {
    const nextSaga = {
      ...baseSaga,
      ...patch,
      updated_at: new Date()
    };
    await rentalRepository.update(rentalId, { booking_saga: nextSaga });
    return nextSaga;
  }

  buildContractPayload(rental) {
    return {
      rental_request_id: rental._id,
      renter_id: rental.renter_id,
      owner_id: rental.owner_id,
      vehicle_id: rental.vehicle_id,
      brand: rental.brand,
      model: rental.model,
      year: rental.year,
      license_plate: rental.license_plate,
      images: rental.images || [],
      rental_start_date: rental.rental_start_date,
      rental_end_date: rental.rental_end_date,
      pickup_location: rental.pickup_location,
      return_location: rental.return_location,
      daily_rate: rental.daily_rate,
      total_days: rental.total_days,
      rental_cost: rental.total_amount,
      deposit_amount: rental.deposit_amount,
      platform_fee: rental.platform_fee,
      total_cost: rental.total_amount
    };
  }

  async createContractBySaga(rental) {
    const response = await axios.post(
      `${CONTRACT_SERVICE_URL}/api/contracts/internal/create`,
      this.buildContractPayload(rental),
      {
        headers: {
          'X-Service-Token': SERVICE_TOKEN
        }
      }
    );

    return response?.data?.data || response?.data;
  }

  async createPaymentBySaga(rental, contract) {
    const response = await axios.post(`${PAYMENT_SERVICE_URL}/api/payments`, {
      contract_id: contract._id,
      renter_id: rental.renter_id,
      owner_id: rental.owner_id,
      payment_type: 'RENTAL_FEE',
      amount: Number(rental.total_amount || 0),
      payment_method: 'BANK_TRANSFER',
      notes: `Saga auto-create payment for rental ${rental._id}`
    });

    return response?.data?.data || response?.data;
  }

  async processPaymentBySaga(paymentId) {
    const transactionId = `SAGA-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const response = await axios.put(`${PAYMENT_SERVICE_URL}/api/payments/${paymentId}/process`, {
      transaction_id: transactionId
    });
    return response?.data?.data || response?.data;
  }

  async failPaymentBySaga(paymentId, reason) {
    try {
      await axios.put(`${PAYMENT_SERVICE_URL}/api/payments/${paymentId}/fail`, {
        reason: reason || 'Saga compensation'
      });
    } catch (error) {
      console.log('Saga compensation fail-payment warning:', error.message);
    }
  }

  async cancelContractBySaga(contractId, reason) {
    try {
      await axios.patch(
        `${CONTRACT_SERVICE_URL}/api/contracts/internal/${contractId}/cancel-saga`,
        {
          reason: reason || 'Saga compensation'
        },
        {
          headers: {
            'X-Service-Token': SERVICE_TOKEN
          }
        }
      );
    } catch (error) {
      console.log('Saga compensation cancel-contract warning:', error.message);
    }
  }

  async runWithRetry(actionName, callback) {
    let attempt = 0;
    let lastError = null;
    while (attempt <= SAGA_MAX_RETRY) {
      try {
        return await callback();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > SAGA_MAX_RETRY) break;
        await delay(SAGA_RETRY_DELAY_MS);
      }
    }
    throw makeError(`${actionName} failed after ${SAGA_MAX_RETRY + 1} attempts: ${lastError?.message || 'Unknown error'}`, 502);
  }

  async compensateApprovalSaga({ rental, saga, contractId, paymentId, error }) {
    if (paymentId) {
      await this.failPaymentBySaga(paymentId, 'Payment compensation due to saga failure');
    }
    if (contractId) {
      await this.cancelContractBySaga(contractId, 'Contract compensation due to saga failure');
    }

    await this.updateVehicleAvailability(rental.vehicle_id, true);

    const failedStep = this.buildSagaStep('COMPENSATION', 'COMPENSATED', error.message || 'Saga compensation executed');
    const compensatedSaga = {
      ...saga,
      status: 'COMPENSATED',
      current_step: 'COMPENSATED',
      contract_id: contractId ? String(contractId) : saga.contract_id || '',
      payment_id: paymentId ? String(paymentId) : saga.payment_id || '',
      last_error: error.message || 'Saga failed',
      steps: [...(saga.steps || []), failedStep]
    };

    await rentalRepository.update(rental._id, {
      status: RENTAL_STATUSES.REJECTED,
      booking_saga: {
        ...compensatedSaga,
        updated_at: new Date()
      }
    });

    await eventBus.publish('rental_rejected', {
      rentalId: rental._id,
      renterId: rental.renter_id,
      ownerId: rental.owner_id,
      reason: 'Saga compensation'
    });
  }

  async createRentalRequest(renterId, rentalData) {
    if (!rentalData?.vehicle_id) {
      throw makeError('Missing required field: vehicle_id', 400);
    }

    const vehicle = await this.fetchVehicle(rentalData.vehicle_id);
    if (!vehicle) {
      throw makeError('Vehicle not found', 404);
    }

    if (!vehicle.is_available) {
      throw makeError('Vehicle is not available', 400);
    }

    if (String(vehicle.owner_id) === String(renterId)) {
      throw makeError('Bạn không thể thuê phương tiện do chính mình đăng.', 400);
    }

    const startDateValue = rentalData.rental_start_date || rentalData.start_date;
    const endDateValue = rentalData.rental_end_date || rentalData.end_date;

    // Date inputs arrive as YYYY-MM-DD. Parse them as local dates so timezone
    // conversion cannot move the booking to the previous day.
    const startDate = parseDateOnly(startDateValue);
    const endDate = parseDateOnly(endDateValue);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw makeError('Invalid rental dates', 400);
    }

    if (startDate < startOfTomorrow()) {
      throw makeError('Ngày nhận xe phải sau ngày hiện tại.', 400);
    }

    if (endDate < startDate) {
      throw makeError('Ngày trả xe phải bằng hoặc sau ngày nhận xe.', 400);
    }

    const todayStart = normalizeDayStart(new Date());
    const startDay = normalizeDayStart(startDate);
    if (!startDay || !todayStart || startDay < todayStart) {
      throw makeError('Ngày nhận xe phải từ ngày hiện tại trở đi.', 400);
    }

    const totalDays =
      Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const dailyRate = Number(vehicle.daily_rate || vehicle.price_per_day || 0);
    if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
      throw makeError('Invalid vehicle daily rate', 400);
    }

    const totalAmount = dailyRate * totalDays;
    const depositAmount = Number(vehicle.deposit_amount || 0);
    const platformFee = totalAmount * 0.04;
    const locationSnapshot = buildVehicleLocationSnapshot(vehicle);
    const [ownerProfile, renterProfile] = await Promise.all([
      this.fetchUserProfile(vehicle.owner_id),
      this.fetchUserProfile(renterId)
    ]);

    const rentalDays = Math.max(1, totalDays);
    const rentalAmount = dailyRate * rentalDays;
    const finalPlatformFee = rentalAmount * 0.04;
    const finalTotalAmount = rentalAmount + depositAmount + finalPlatformFee;

    const vehicleSnapshot = {
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      license_plate: vehicle.license_plate || '',
      vehicle_type: vehicle.vehicle_type || '',
      fuel_type: vehicle.fuel_type || '',
      transmission: vehicle.transmission || '',
      seats: Number(vehicle.seats || 0),
      year: Number(vehicle.year || 0),
      image: Array.isArray(vehicle.images) ? vehicle.images[0] || '' : '',
      pickup_location: locationSnapshot.pickup_location,
      return_location: locationSnapshot.return_location
    };

    const ownerSnapshot = {
      name: getDisplayName(ownerProfile || {}),
      email: ownerProfile?.email || '',
      phone: ownerProfile?.phone || '',
      payout_info: buildPayoutSnapshot(ownerProfile || {})
    };

    const renterSnapshot = {
      name: getDisplayName(renterProfile || {}),
      email: renterProfile?.email || '',
      phone: renterProfile?.phone || ''
    };

    const pricingSnapshot = {
      daily_rate: dailyRate,
      deposit_amount: depositAmount,
      rental_days: rentalDays,
      rental_amount: rentalAmount,
      platform_fee: finalPlatformFee,
      total_amount: finalTotalAmount
    };

    const rental = await rentalRepository.create({
      vehicle_id: rentalData.vehicle_id,
      rental_start_date: startDate,
      rental_end_date: endDate,
      notes: rentalData.notes || rentalData.note || '',
      renter_id: renterId,
      owner_id: vehicle.owner_id,
      daily_rate: dailyRate,
      deposit_amount: depositAmount,
      total_days: rentalDays,
      total_amount: finalTotalAmount,
      platform_fee: finalPlatformFee,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      license_plate: vehicle.license_plate,
      images: Array.isArray(vehicle.images) ? vehicle.images : [],
      vehicle_snapshot: vehicleSnapshot,
      owner_snapshot: ownerSnapshot,
      renter_snapshot: renterSnapshot,
      pricing_snapshot: pricingSnapshot,
      status: RENTAL_STATUSES.PENDING,
      ...locationSnapshot
    });

    await eventBus.publish('rental_request_created', {
      rentalId: rental._id,
      renterId: renterId,
      ownerId: rental.owner_id,
      vehicleId: rental.vehicle_id
    });

    return rental;
  }

  async approveRental(rentalId, ownerId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.owner_id) !== String(ownerId)) {
      throw makeError('Not authorized to approve this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (currentStatus !== RENTAL_STATUSES.PENDING) {
      throw makeError('Only pending rentals can be approved', 400);
    }

    const sagaId = crypto.randomUUID();
    let saga = {
      saga_id: sagaId,
      status: 'STARTED',
      current_step: 'OWNER_APPROVED',
      contract_id: '',
      payment_id: '',
      last_error: '',
      steps: [this.buildSagaStep('OWNER_APPROVED', 'SUCCESS', 'Owner approved rental request')],
      updated_at: new Date()
    };

    let updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.APPROVED,
      booking_saga: saga
    });

    let contractId = '';
    let paymentId = '';

    try {
      await this.updateVehicleAvailability(rental.vehicle_id, false);
      saga = await this.updateSagaState(rentalId, saga, {
        current_step: 'VEHICLE_RESERVED',
        steps: [...saga.steps, this.buildSagaStep('VEHICLE_RESERVED', 'SUCCESS', 'Vehicle availability set to false')]
      });

      const createdContract = await this.runWithRetry('Create contract', () =>
        this.createContractBySaga(updated)
      );
      contractId = createdContract?._id ? String(createdContract._id) : '';

      saga = await this.updateSagaState(rentalId, saga, {
        current_step: 'CONTRACT_CREATED',
        contract_id: contractId,
        steps: [...saga.steps, this.buildSagaStep('CONTRACT_CREATED', 'SUCCESS', `Contract ${contractId} created`)]
      });

      const createdPayment = await this.runWithRetry('Create payment', () =>
        this.createPaymentBySaga(updated, createdContract)
      );
      paymentId = createdPayment?._id ? String(createdPayment._id) : '';

      saga = await this.updateSagaState(rentalId, saga, {
        current_step: 'PAYMENT_CREATED',
        payment_id: paymentId,
        steps: [...saga.steps, this.buildSagaStep('PAYMENT_CREATED', 'SUCCESS', `Payment ${paymentId} created`)]
      });

      await this.runWithRetry('Process payment', () => this.processPaymentBySaga(paymentId));

      saga = await this.updateSagaState(rentalId, saga, {
        current_step: 'PAYMENT_COMPLETED',
        steps: [...saga.steps, this.buildSagaStep('PAYMENT_COMPLETED', 'SUCCESS', `Payment ${paymentId} completed`)]
      });

      updated = await rentalRepository.update(rentalId, {
        status: RENTAL_STATUSES.CONFIRMED,
        booking_saga: {
          ...saga,
          status: 'COMPLETED',
          current_step: 'SAGA_COMPLETED',
          steps: [...saga.steps, this.buildSagaStep('SAGA_COMPLETED', 'SUCCESS', 'Booking saga completed')],
          updated_at: new Date()
        }
      });

      await eventBus.publish('rental_confirmed', {
        rentalId: updated._id,
        renterId: updated.renter_id,
        ownerId: updated.owner_id,
        vehicleId: updated.vehicle_id,
        rentalStartDate: updated.rental_start_date,
        rentalEndDate: updated.rental_end_date,
        pickupLocation: updated.pickup_location,
        returnLocation: updated.return_location,
        dailyRate: updated.daily_rate,
        totalDays: updated.total_days,
        totalAmount: updated.total_amount,
        depositAmount: updated.deposit_amount,
        platformFee: updated.platform_fee,
        brand: updated.brand,
        model: updated.model,
        year: updated.year,
        license_plate: updated.license_plate,
        images: updated.images,
        contractId,
        paymentId,
        sagaId
      });

      return updated;
    } catch (error) {
      await this.compensateApprovalSaga({
        rental: updated || rental,
        saga,
        contractId,
        paymentId,
        error
      });
      throw makeError(`Approve rental saga failed: ${error.message}`, error.status || 502);
    }
  }

  async confirmRental(rentalId, ownerId) {
    return this.approveRental(rentalId, ownerId);
  }

  async rejectRental(rentalId, ownerId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.owner_id) !== String(ownerId)) {
      throw makeError('Not authorized to reject this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (![RENTAL_STATUSES.PENDING, RENTAL_STATUSES.APPROVED, RENTAL_STATUSES.CONFIRMED].includes(currentStatus)) {
      throw makeError('Only pending or approved rentals can be rejected', 400);
    }

    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.REJECTED
    });

    if ([RENTAL_STATUSES.APPROVED, RENTAL_STATUSES.CONFIRMED].includes(currentStatus)) {
      await this.updateVehicleAvailability(rental.vehicle_id, true);
    }

    await eventBus.publish('rental_rejected', {
      rentalId: updated._id,
      renterId: updated.renter_id,
      ownerId: updated.owner_id
    });

    return updated;
  }

  async confirmPickup(rentalId, renterId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.renter_id) !== String(renterId)) {
      throw makeError('Not authorized to confirm pickup for this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (![RENTAL_STATUSES.APPROVED, RENTAL_STATUSES.CONFIRMED].includes(currentStatus)) {
      throw makeError('Only approved rentals can be marked as active', 400);
    }

    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.ACTIVE,
      pickup_confirmed_at: new Date()
    });

    await this.syncContractStatusByRental(rentalId, 'ACTIVE');
    return updated;
  }

  async requestReturn(rentalId, renterId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.renter_id) !== String(renterId)) {
      throw makeError('Not authorized to return this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (currentStatus !== RENTAL_STATUSES.ACTIVE) {
      throw makeError('Only active rentals can be returned', 400);
    }

    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.RETURN_REQUESTED,
      return_requested_at: new Date()
    });

    return updated;
  }

  async confirmReturn(rentalId, ownerId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.owner_id) !== String(ownerId)) {
      throw makeError('Not authorized to confirm return for this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (![RENTAL_STATUSES.RETURN_REQUESTED, RENTAL_STATUSES.ACTIVE].includes(currentStatus)) {
      throw makeError('Rental is not waiting for return confirmation', 400);
    }

    const completedAt = new Date();
    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.COMPLETED,
      completed_at: completedAt
    });

    await this.updateVehicleAvailability(rental.vehicle_id, true);
    await this.syncContractStatusByRental(rentalId, 'COMPLETED', { return_time: completedAt });
    return updated;
  }

  async markDisputed(rentalId, actorId, reason = '') {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    const isRenter = String(rental.renter_id) === String(actorId);
    const isOwner = String(rental.owner_id) === String(actorId);
    if (!isRenter && !isOwner) {
      throw makeError('Not authorized to dispute this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (
      ![
        RENTAL_STATUSES.RETURN_REQUESTED,
        RENTAL_STATUSES.ACTIVE,
        RENTAL_STATUSES.APPROVED,
        RENTAL_STATUSES.CONFIRMED
      ].includes(currentStatus)
    ) {
      throw makeError('Rental cannot be disputed in current status', 400);
    }

    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.DISPUTED,
      dispute_reason: reason || 'Chưa cung cấp lý do'
    });

    await this.syncContractStatusByRental(rentalId, 'DISPUTED');
    return updated;
  }

  async cancelRental(rentalId, requesterId) {
    const rental = await rentalRepository.findById(rentalId);
    if (!rental) {
      throw makeError('Rental not found', 404);
    }
    if (String(rental.renter_id) !== String(requesterId)) {
      throw makeError('Not authorized to cancel this rental', 403);
    }

    const currentStatus = upper(rental.status);
    if (![RENTAL_STATUSES.PENDING, RENTAL_STATUSES.APPROVED, RENTAL_STATUSES.CONFIRMED].includes(currentStatus)) {
      throw makeError('Only pending or approved rentals can be cancelled', 400);
    }

    const updated = await rentalRepository.update(rentalId, {
      status: RENTAL_STATUSES.CANCELLED
    });

    if ([RENTAL_STATUSES.APPROVED, RENTAL_STATUSES.CONFIRMED].includes(currentStatus)) {
      await this.updateVehicleAvailability(rental.vehicle_id, true);
    }

    await eventBus.publish('rental_cancelled', {
      rentalId: updated._id,
      renterId: updated.renter_id,
      amount: updated.total_amount
    });

    return updated;
  }

  async getRentalById(rentalId) {
    return await rentalRepository.findById(rentalId);
  }

  async getRenterRentals(renterId) {
    return await rentalRepository.findByRenterId(renterId);
  }

  async getOwnerRentals(ownerId) {
    return await rentalRepository.findByOwnerId(ownerId);
  }

  async getAdminRentals(filters = {}, options = {}) {
    const query = {};
    if (filters.status) query.status = upper(filters.status);
    if (filters.owner_id) query.owner_id = filters.owner_id;
    if (filters.renter_id) query.renter_id = filters.renter_id;
    if (filters.vehicle_id) query.vehicle_id = filters.vehicle_id;
    return await rentalRepository.findAll(query, options);
  }

  async checkAvailability(vehicleId, startDate, endDate) {
    const conflicts = await rentalRepository.findByVehicleId(vehicleId);
    const blockedStatuses = new Set([
      RENTAL_STATUSES.APPROVED,
      RENTAL_STATUSES.CONFIRMED,
      RENTAL_STATUSES.ACTIVE,
      RENTAL_STATUSES.RETURN_REQUESTED
    ]);

    for (const rental of conflicts) {
      if (!blockedStatuses.has(upper(rental.status))) continue;

      const rentalStart = new Date(rental.rental_start_date);
      const rentalEnd = new Date(rental.rental_end_date);
      const newStart = parseDateOnly(startDate);
      const newEnd = parseDateOnly(endDate);
      if (!(newEnd < rentalStart || newStart > rentalEnd)) {
        return false;
      }
    }
    return true;
  }
}

export default new RentalService();
