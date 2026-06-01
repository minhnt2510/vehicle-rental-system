import { ContractRepository } from '../repositories/ContractRepository.js';
import { EventBus } from '../events/EventBus.js';
import axios from 'axios';
import amqp from 'amqplib';
import FormData from 'form-data';

const contractRepository = new ContractRepository();
const eventBus = new EventBus();

export class ContractService {
  async createContract(contractData) {
    const contract = await contractRepository.create(contractData);

    await eventBus.publish('contract_created', {
      contractId: contract._id,
      rentalRequestId: contract.rental_request_id,
      renterId: contract.renter_id,
      ownerId: contract.owner_id
    });

    return contract;
  }

  async createContractIfNotExists(contractData) {
    const existing = await contractRepository.findByRentalRequestId(contractData.rental_request_id);
    if (existing) {
      return existing;
    }
    return this.createContract(contractData);
  }

  async getContractById(contractId) {
    return await contractRepository.findById(contractId);
  }

  async updateContract(contractId, updateData) {
    const contract = await contractRepository.update(contractId, updateData);

    await eventBus.publish('contract_updated', {
      contractId: contract._id,
      status: contract.status
    });

    return contract;
  }

  async pickupVehicle(contractId, files, body, authHeader) {
    const contract = await contractRepository.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    if (contract.status !== 'ACTIVE') {
      throw new Error('Only active contracts can be picked up');
    }
    if (!files || files.length === 0) {
      throw new Error('Pickup images are required');
    }
    if (contract.pickup_images.length > 0) {
      throw new Error('Picked up vehicle cannot be picked up again');
    }
    // Upload images to image service
    let pickupImageUrls = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });
        const response = await axios.post(`${process.env.IMAGE_SERVICE_URL}/api/images/upload`, formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': authHeader
          }
        });
        pickupImageUrls.push(response.data.data.url);
      } catch (error) {
        console.error('Error uploading image:', error);
        throw new Error('Failed to upload pickup images');
      }
    }
    const updatedContract = await contractRepository.update(contractId, {
      pickup_images: pickupImageUrls,
      pickup_description: body.description,
      pickup_time: new Date(),
    });

    return updatedContract;
  }

  async returnVehicle(contractId, files, body, authHeader) {
    const contract = await contractRepository.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    if (contract.status !== 'ACTIVE') {
      throw new Error('Only active contracts can be returned');
    }
    if (!files || files.length === 0) {
      throw new Error('Return images are required');
    }
    if (contract.return_images.length > 0) {
      throw new Error('Returned vehicle cannot be returned again');
    }
    // Upload images to image service
    let returnImageUrls = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype
        });
        const response = await axios.post(`${process.env.IMAGE_SERVICE_URL}/api/images/upload`, formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': authHeader
          }
        });
        returnImageUrls.push(response.data.data.url);
      } catch (error) {
        console.error('Error uploading image:', error);
        throw new Error('Failed to upload return images');
      }
    }
    const updatedContract = await contractRepository.update(contractId, {
      return_images: returnImageUrls,
      return_description: body.description,
      return_time: new Date(),
    });

    return updatedContract;
  }

  async cancelContract(contractId, userId, body) {
    const contract = await contractRepository.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }
    if (contract.status !== 'ACTIVE') {
      throw new Error('Only active contracts can be cancelled');
    }
    let cancelledBy;
    if (contract.renter_id.toString() == userId) {
      cancelledBy = 'RENTER';
    } else if (contract.owner_id.toString() == userId) {
      cancelledBy = 'OWNER';
    } else {
      throw new Error('Not authorized to cancel this contract');
    }

    // Calculate refund based on who cancelled
    let refundAmount = contract.deposit_amount;
    let cancellationFeeAmount = 0;

    if (cancelledBy === 'OWNER') {
      // Owner cancels: return full deposit minus 20% of contract value
      cancellationFeeAmount = contract.total_cost * 0.20;
      refundAmount = contract.deposit_amount - cancellationFeeAmount;
    } else if (cancelledBy === 'RENTER') {
      // Renter cancels: return deposit minus 20% of contract value
      cancellationFeeAmount = contract.total_cost * 0.20;
      refundAmount = contract.deposit_amount - cancellationFeeAmount;
    }

    const updatedContract = await contractRepository.update(contractId, {
      status: 'CANCELLED',
      cancellation_fee_applied: true,
      cancellation_fee_amount: cancellationFeeAmount,
      refund_amount: refundAmount,
      cancellation_reason: body.reason,
      cancelled_by: cancelledBy,
      cancelled_at: new Date()
    });

    await eventBus.publish('contract_cancelled', {
      contractId: updatedContract._id,
      renterId: updatedContract.renter_id,
      refundAmount,
      cancellationFee: cancellationFeeAmount
    });

    return updatedContract;
  }

  async cancelContractBySaga(contractId, reason = '') {
    const contract = await contractRepository.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.status === 'CANCELLED') {
      return contract;
    }

    return await contractRepository.update(contractId, {
      status: 'CANCELLED',
      cancellation_fee_applied: false,
      cancellation_fee_amount: 0,
      refund_amount: Number(contract.deposit_amount || 0),
      cancellation_reason: reason || 'Saga compensation',
      cancelled_at: new Date()
    });
  }

  async getRenterContracts(renterId) {
    return await contractRepository.findByRenterId(renterId);
  }

  async getOwnerContracts(ownerId) {
    return await contractRepository.findByOwnerId(ownerId);
  }

  async getAdminContracts(filters = {}, options = {}) {
    const query = {};
    if (filters.status) {
      query.status = String(filters.status).toUpperCase();
    }
    if (filters.owner_id) {
      query.owner_id = filters.owner_id;
    }
    if (filters.renter_id) {
      query.renter_id = filters.renter_id;
    }
    if (filters.vehicle_id) {
      query.vehicle_id = filters.vehicle_id;
    }

    return await contractRepository.findAll(query, options);
  }

  async subscribeToEvents() {
    await eventBus.subscribe('rental_confirmed', async (data) => {
      try {
        const existing = await contractRepository.findByRentalRequestId(data.rentalId);
        if (existing) {
          return;
        }

        const contract = await contractRepository.create({
          rental_request_id: data.rentalId,
          renter_id: data.renterId,
          owner_id: data.ownerId,
          vehicle_id: data.vehicleId,
          brand: data.brand,
          model: data.model,
          year: data.year,
          license_plate: data.license_plate,
          images: data.images,
          rental_start_date: data.rentalStartDate,
          rental_end_date: data.rentalEndDate,
          pickup_location: data.pickupLocation,
          return_location: data.returnLocation,
          daily_rate: data.dailyRate,
          total_days: data.totalDays,
          rental_cost: data.totalAmount,
          deposit_amount: data.depositAmount,
          platform_fee: data.platformFee,
          total_cost: data.totalAmount + data.depositAmount,
          status: 'ACTIVE'
        });

        console.log('Contract created:', contract._id);
      } catch (err) {
        console.error('Failed to create contract:', err.message);
      }
    });
  }
}

export default new ContractService();
