import { ReviewRepository } from '../repositories/ReviewRepository.js';
import mongoose from 'mongoose';
import axios from 'axios';

const reviewRepository = new ReviewRepository();
const RENTAL_SERVICE_URL = process.env.RENTAL_SERVICE_URL || 'http://localhost:3003';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'internal-service-token';

function toObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return value;
}

export class ReviewService {
  async fetchRentalSnapshot(rentalRequestId) {
    try {
      const response = await axios.get(
        `${RENTAL_SERVICE_URL}/api/rentals/internal/${rentalRequestId}`,
        {
          headers: {
            'X-Service-Token': SERVICE_TOKEN
          }
        }
      );
      const rental = response?.data?.data || response?.data || null;
      if (rental) return rental;
    } catch (error) {
      console.log('Fetch rental via rental-service failed, fallback local query:', error.message);
    }

    const rental = await mongoose.connection.collection('rental_requests').findOne({
      _id: toObjectId(rentalRequestId)
    });

    return rental || null;
  }

  async createReview(reviewData) {
    const rentalRequestId = reviewData?.rental_request_id || reviewData?.contract_id;
    const reviewerId = reviewData?.reviewer_id;
    const reviewedUserId = reviewData?.reviewed_user_id;

    if (!rentalRequestId || !reviewerId || !reviewedUserId) {
      throw new Error('Missing required fields for review');
    }

    if (String(reviewerId) === String(reviewedUserId)) {
      throw new Error('Reviewer and reviewed user must be different');
    }

    const rating = Number(reviewData?.rating || 0);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const rental = await this.fetchRentalSnapshot(rentalRequestId);

    if (!rental) {
      throw new Error('Rental request not found');
    }

    const rentalStatus = String(rental.status || '').toUpperCase();
    if (rentalStatus !== 'COMPLETED') {
      throw new Error('Bạn chỉ có thể đánh giá sau khi chuyến thuê hoàn tất.');
    }

    const reviewerIsRenter = String(rental.renter_id) === String(reviewerId);
    const reviewerIsOwner = String(rental.owner_id) === String(reviewerId);
    if (!reviewerIsRenter && !reviewerIsOwner) {
      throw new Error('Reviewer is not related to this rental');
    }

    const expectedReviewedId = reviewerIsRenter ? String(rental.owner_id) : String(rental.renter_id);
    if (String(reviewedUserId) !== expectedReviewedId) {
      throw new Error('Reviewed user does not match rental participants');
    }

    const existing = await reviewRepository.findByRentalAndReviewer(rental._id, reviewerId);
    if (existing) {
      throw new Error('Bạn đã đánh giá chuyến thuê này rồi.');
    }

    const review = await reviewRepository.create({
      ...reviewData,
      rental_request_id: rental._id,
      rating
    });
    return review;
  }

  async getReviewById(reviewId) {
    return await reviewRepository.findById(reviewId);
  }

  async updateReview(reviewId, updateData) {
    return await reviewRepository.update(reviewId, updateData);
  }

  async getReviewsByUser(userId) {
    return await reviewRepository.findByReviewedUserId(userId);
  }

  async getReviewsByRenter(renterId) {
    return await reviewRepository.findByReviewerId(renterId);
  }

  async calculateAverageRating(userId) {
    const reviews = await this.getReviewsByUser(userId);
    if (reviews.length === 0) return 5.0;

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (totalRating / reviews.length).toFixed(1);
  }

  async getReviewsByVehicle(vehicleId) {
    return await reviewRepository.findByVehicleId(vehicleId);
  }

  async deleteReview(reviewId) {
    return await reviewRepository.delete(reviewId);
  }

  async getTopRatedUsers(limit = 10) {
    // Aggregate reviews to find top-rated users
    // This is simplified - in production would use MongoDB aggregation
    const allUsers = {};
    // Implementation would aggregate reviews by reviewed_user_id and calculate averages
    return [];
  }
}

export default new ReviewService();
