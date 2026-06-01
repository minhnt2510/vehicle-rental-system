import { PaymentRepository } from '../repositories/PaymentRepository.js';
import { EventBus } from '../events/EventBus.js';

const paymentRepository = new PaymentRepository();
const eventBus = new EventBus();

export class PaymentService {
  async createPayment(paymentData) {
    const platformFee = paymentData.amount * 0.04;
    const payment = await paymentRepository.create({
      ...paymentData,
      platform_fee: platformFee,
      status: 'PENDING'
    });

    return payment;
  }

  async processPayment(paymentId, transactionId, actorId = '', actorRole = '') {
    const current = await paymentRepository.findById(paymentId);
    if (!current) {
      throw new Error('Payment not found');
    }

    if (String(current.status || '').toUpperCase() === 'COMPLETED') {
      return current;
    }

    const isAdmin = String(actorRole || '').toUpperCase() === 'ADMIN';
    if (!isAdmin && String(current.renter_id) !== String(actorId)) {
      throw new Error('Not authorized to process this payment');
    }

    const payment = await paymentRepository.update(paymentId, {
      status: 'COMPLETED',
      transaction_id: transactionId
    });

    await eventBus.publish('payment_completed', {
      paymentId: payment._id,
      contractId: payment.contract_id,
      renterId: payment.renter_id,
      amount: payment.amount
    });

    return payment;
  }

  async failPayment(paymentId, reason) {
    return await paymentRepository.update(paymentId, {
      status: 'FAILED',
      notes: reason
    });
  }

  async refundPayment(paymentId) {
    const payment = await paymentRepository.findById(paymentId);
    
    const refund = await paymentRepository.create({
      contract_id: payment.contract_id,
      renter_id: payment.renter_id,
      owner_id: payment.owner_id,
      payment_type: 'REFUND',
      amount: payment.amount,
      platform_fee: 0,
      status: 'COMPLETED',
      notes: `Refund for payment ${paymentId}`
    });

    await eventBus.publish('payment_refunded', {
      paymentId: refund._id,
      originalPaymentId: paymentId,
      renterId: payment.renter_id,
      amount: payment.amount
    });

    return refund;
  }

  async getPaymentById(paymentId) {
    return await paymentRepository.findById(paymentId);
  }

  async getRenterPayments(renterId) {
    return await paymentRepository.findByRenterId(renterId);
  }

  async getOwnerPayments(ownerId) {
    return await paymentRepository.findByOwnerId(ownerId);
  }

  async getContractPayments(contractId) {
    return await paymentRepository.findByContractId(contractId);
  }

  async getAdminPayments(filters = {}, options = {}) {
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
    if (filters.contract_id) {
      query.contract_id = filters.contract_id;
    }
    if (filters.payment_type) {
      query.payment_type = String(filters.payment_type).toUpperCase();
    }

    return await paymentRepository.findAll(query, options);
  }

  async calculateTotalRevenue() {
    // This would be used for statistics
    const payments = await paymentRepository.findByStatus('COMPLETED');
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  }

  async calculatePlatformRevenue() {
    const payments = await paymentRepository.findByStatus('COMPLETED');
    return payments.reduce((sum, payment) => sum + (payment.platform_fee || 0), 0);
  }
}

export default new PaymentService();
