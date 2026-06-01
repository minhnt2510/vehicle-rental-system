import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data';
import { UserRepository } from '../repositories/UserRepository.js';
import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import OwnerApplication from '../models/OwnerApplication.js';
import mongoose from 'mongoose';

const userRepository = new UserRepository();

export class UserService {
  isUserInactive(user) {
    return Boolean(user?.deleted_at) || user?.is_active === false;
  }

  normalizeOwnerStatus(value) {
    const status = String(value || '').toUpperCase();
    if (status === 'APPROVED') return 'APPROVED';
    if (status === 'PENDING') return 'PENDING';
    if (status === 'REJECTED') return 'REJECTED';
    return 'NONE';
  }

  getJwtAlgorithm() {
    return process.env.JWT_ALGORITHM || 'RS256';
  }

  buildInternalUserSummary(user = null) {
    if (!user) return null;
    const normalizedOwnerStatus = this.normalizeOwnerStatus(user.owner_status);
    const payout = user.payout_info || {};
    return {
      _id: user._id,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      full_name: user.full_name || '',
      phone: user.phone || '',
      owner_status: normalizedOwnerStatus,
      bank_name: user.bank_name || payout.bank_name || '',
      bank_code: user.bank_code || payout.bank_code || '',
      bank_account_holder: user.bank_account_holder || payout.bank_account_holder || '',
      bank_account_number: user.bank_account_number || payout.bank_account_number || '',
      payout_info: payout,
      is_active: user.is_active !== false,
      deleted_at: user.deleted_at || null
    };
  }

  async getInternalUserSummary(userId) {
    if (!mongoose.Types.ObjectId.isValid(String(userId || ''))) {
      return null;
    }

    const user = await User.findById(userId).lean();
    return this.buildInternalUserSummary(user);
  }

  async getInternalUserSummaries(userIds = []) {
    const ids = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((item) => String(item || ''))
          .filter((item) => mongoose.Types.ObjectId.isValid(item))
      )
    );

    if (!ids.length) {
      return [];
    }

    const rows = await User.find({ _id: { $in: ids } }).lean();
    return rows.map((row) => this.buildInternalUserSummary(row)).filter(Boolean);
  }

  getPrivateKey() {
    const inlinePrivateKey = process.env.JWT_PRIVATE_KEY;
    if (inlinePrivateKey) {
      return inlinePrivateKey.replace(/\\n/g, '\n');
    }

    const privateKeyPath = path.resolve(process.env.JWT_PRIVATE_KEY_PATH || './keys/private.key');
    try {
      return fs.readFileSync(privateKeyPath, 'utf8');
    } catch (error) {
      throw new Error(
        `Cannot read JWT private key. Set JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH. Tried: ${privateKeyPath}`
      );
    }
  }

  async register(userData) {
    const existingUser = await userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = await userRepository.create({
      ...userData,
      owner_status: 'NONE',
      password: hashedPassword
    });

    return {
      id: user._id,
      email: user.email,
      first_name: user.first_name,
      role: user.role,
      owner_status: this.normalizeOwnerStatus(user.owner_status)
    };
  }

  async login(email, password) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    if (this.isUserInactive(user)) {
      throw new Error('Tài khoản đã bị khóa hoặc không còn hoạt động.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    const privateKey = this.getPrivateKey();

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      privateKey,
      { 
        algorithm: this.getJwtAlgorithm(),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }
    );

    return {
      token,
      user: {
        id: user._id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        owner_status: this.normalizeOwnerStatus(user.owner_status),
        owner_application_id: user.owner_application_id || null,
        rejection_reason: user.rejection_reason || ''
      }
    };
  }

  async getUserProfile(userId) {
    console.log('Getting user profile for userId:', userId);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (this.isUserInactive(user)) {
      throw new Error('Tài khoản đã bị khóa hoặc không còn hoạt động.');
    }
    const safeUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };
    delete safeUser.password;
    return safeUser;
  }

  async updateProfile(userId, updateData) {
    const current = await userRepository.findById(userId);
    if (!current) {
      throw new Error('User not found');
    }
    if (this.isUserInactive(current)) {
      throw new Error('Tài khoản đã bị khóa hoặc không còn hoạt động.');
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone', 'avatar', 'address',
      'bank_account', 'bank_name', 'id_number', 'license_number'
    ];
    
    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    const updated = await userRepository.update(userId, filteredData);
    const safeUser = typeof updated?.toObject === 'function' ? updated.toObject() : { ...updated };
    delete safeUser.password;
    return safeUser;
  }

  async verifyPersonalInformation(userId, infoData, files, authHeader) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!infoData.id_number) {
      throw new Error('Missing required field: id_number');
    }

    if (!files || !files.id_image_front || !files.id_image_back) {
      throw new Error('Missing required image files: id_image_front and id_image_back');
    }

    try {
      const uploadImage = async (file) => {
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

        return response.data.data.url;
      };

      const frontImageUrl = await uploadImage(files.id_image_front[0]);
      const backImageUrl = await uploadImage(files.id_image_back[0]);

      const updateData = {
        id_number: infoData.id_number,
        id_image_front: frontImageUrl,
        id_image_back: backImageUrl,
        kyc_status: 'APPROVED'
      };

      const updatedUser = await userRepository.update(userId, updateData);

      return {
        success: true,
        message: 'Personal information verified successfully',
        user: {
          id: updatedUser._id,
          email: updatedUser.email,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          id_number: updatedUser.id_number,
          kyc_status: updatedUser.kyc_status
        }
      };
    } catch (error) {
      throw new Error(`Failed to verify personal information: ${error.message}`);
    }
  }

  normalizeUserRole(value) {
    return String(value || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
  }

  normalizeOwnerProfile(profile = {}) {
    const normalized = profile || {};
    const digits = String(normalized.bank_account_number || '').replace(/\D/g, '');
    return {
      legal_name: normalized.legal_name || normalized.full_name || '',
      phone: normalized.phone || '',
      email: normalized.email || '',
      address: normalized.address || '',
      id_number: normalized.id_number || '',
      id_card_front_url:
        normalized.id_card_front_url ||
        normalized.id_image_front ||
        normalized.id_front_url ||
        '',
      id_card_back_url:
        normalized.id_card_back_url ||
        normalized.id_image_back ||
        normalized.id_back_url ||
        '',
      bank_name: normalized.bank_name || '',
      bank_code: normalized.bank_code || '',
      bank_account_number: normalized.bank_account_number || '',
      bank_account_holder: normalized.bank_account_holder || '',
      bank_branch: normalized.bank_branch || '',
      card_brand: normalized.card_brand || '',
      card_last4: normalized.card_last4 || (digits ? digits.slice(-4) : ''),
      payout_method: normalized.payout_method || normalized.method || 'BANK',
      payout_note: normalized.payout_note || ''
    };
  }

  mapOwnerApplication(application) {
    if (!application) return null;
    const ownerProfile = this.normalizeOwnerProfile(application.owner_profile || {});
    return {
      _id: application._id,
      user_id: application.user_id,
      applicant_name: application.applicant_name || ownerProfile.legal_name || '',
      email: application.email || ownerProfile.email || '',
      phone: application.phone || ownerProfile.phone || '',
      owner_profile: ownerProfile,
      legal_name: ownerProfile.legal_name,
      address: ownerProfile.address,
      id_number: ownerProfile.id_number,
      id_card_front_url: ownerProfile.id_card_front_url,
      id_card_back_url: ownerProfile.id_card_back_url,
      bank_name: ownerProfile.bank_name,
      bank_account_number: ownerProfile.bank_account_number,
      bank_account_holder: ownerProfile.bank_account_holder,
      bank_branch: ownerProfile.bank_branch,
      payout_info: {
        method: ownerProfile.payout_method || 'BANK',
        bank_name: ownerProfile.bank_name,
        bank_code: ownerProfile.bank_code || '',
        bank_account_holder: ownerProfile.bank_account_holder,
        bank_account_number: ownerProfile.bank_account_number,
        card_brand: ownerProfile.card_brand || '',
        card_last4: ownerProfile.card_last4 || '',
        payout_note: ownerProfile.payout_note || ''
      },
      status: this.normalizeOwnerStatus(application.status),
      rejection_reason: application.rejection_reason || '',
      review_note: application.review_note || '',
      submitted_at: application.submitted_at || application.created_at || null,
      reviewed_at: application.reviewed_at || null,
      reviewed_by: application.reviewed_by || null,
      created_at: application.created_at,
      updated_at: application.updated_at
    };
  }

  async buildAdminUserRows(rawUsers = []) {
    const users = Array.isArray(rawUsers) ? rawUsers : [];
    if (!users.length) {
      return [];
    }

    const userIds = users.map((item) => item._id).filter(Boolean);
    const db = mongoose.connection;
    const [ownerVehicleCounts, renterRequestCounts, ownerApplications] = await Promise.all([
      db
        .collection('vehicles')
        .aggregate([
          { $match: { owner_id: { $in: userIds } } },
          { $group: { _id: '$owner_id', count: { $sum: 1 } } }
        ])
        .toArray(),
      db
        .collection('rental_requests')
        .aggregate([
          { $match: { renter_id: { $in: userIds } } },
          { $group: { _id: '$renter_id', count: { $sum: 1 } } }
        ])
        .toArray(),
      OwnerApplication.find({ user_id: { $in: userIds } })
        .sort({ created_at: -1 })
        .lean()
    ]);

    const ownerVehicleMap = new Map(ownerVehicleCounts.map((item) => [String(item._id), Number(item.count || 0)]));
    const renterRequestMap = new Map(renterRequestCounts.map((item) => [String(item._id), Number(item.count || 0)]));
    const ownerApplicationMap = new Map();
    ownerApplications.forEach((item) => {
      const key = String(item.user_id || '');
      if (key && !ownerApplicationMap.has(key)) {
        ownerApplicationMap.set(key, item);
      }
    });

    return users.map((user) => {
      const key = String(user._id || '');
      const application = ownerApplicationMap.get(key);
      const isDeleted = Boolean(user.deleted_at);
      const isBlocked = user.is_active === false && !isDeleted;
      return {
        ...user,
        role: this.normalizeUserRole(user.role),
        owner_status: this.normalizeOwnerStatus(user.owner_status),
        account_status: isDeleted ? 'DELETED' : isBlocked ? 'BLOCKED' : 'ACTIVE',
        owned_vehicle_count: ownerVehicleMap.get(key) || 0,
        renter_request_count: renterRequestMap.get(key) || 0,
        owner_application: this.mapOwnerApplication(application)
      };
    });
  }

  async listUsersForAdmin(params = {}) {
    const page = Math.max(parseInt(params.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200);
    const skip = (page - 1) * limit;
    const filters = {};

    if (params.role) {
      filters.role = this.normalizeUserRole(params.role);
    }

    if (params.owner_status) {
      filters.owner_status = this.normalizeOwnerStatus(params.owner_status);
    }

    const keyword = String(params.q || params.keyword || '').trim();
    if (keyword) {
      filters.$or = [
        { email: { $regex: keyword, $options: 'i' } },
        { first_name: { $regex: keyword, $options: 'i' } },
        { last_name: { $regex: keyword, $options: 'i' } },
        { phone: { $regex: keyword, $options: 'i' } }
      ];
    }

    const [total, rows] = await Promise.all([
      User.countDocuments(filters),
      User.find(filters)
        .select('-password')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const data = await this.buildAdminUserRows(rows);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getUserDetailForAdmin(userId) {
    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      throw new Error('User not found');
    }

    const rows = await this.buildAdminUserRows([user]);
    return rows[0];
  }

  async blockUserByAdmin(adminId, userId, reason = '') {
    const target = await User.findById(userId);
    if (!target) {
      throw new Error('User not found');
    }
    if (String(target._id) === String(adminId)) {
      throw new Error('Admin không thể tự khóa chính mình.');
    }
    if (this.normalizeUserRole(target.role) === 'ADMIN') {
      throw new Error('Không thể khóa tài khoản ADMIN khác.');
    }

    const updated = await userRepository.update(userId, {
      is_active: false,
      blocked_at: new Date(),
      blocked_by: adminId,
      block_reason: String(reason || '').trim() || 'Khóa bởi quản trị viên'
    });

    const payload = typeof updated?.toObject === 'function' ? updated.toObject() : { ...updated };
    delete payload.password;
    return payload;
  }

  async unblockUserByAdmin(adminId, userId) {
    const target = await User.findById(userId);
    if (!target) {
      throw new Error('User not found');
    }
    if (Boolean(target.deleted_at)) {
      throw new Error('Tài khoản đã bị xóa mềm, không thể mở khóa trực tiếp.');
    }

    const updated = await userRepository.update(userId, {
      is_active: true,
      blocked_at: null,
      blocked_by: null,
      block_reason: ''
    });

    const payload = typeof updated?.toObject === 'function' ? updated.toObject() : { ...updated };
    delete payload.password;
    return payload;
  }

  async softDeleteUserByAdmin(adminId, userId, reason = '') {
    const target = await User.findById(userId);
    if (!target) {
      throw new Error('User not found');
    }
    if (String(target._id) === String(adminId)) {
      throw new Error('Admin không thể tự xóa chính mình.');
    }
    if (this.normalizeUserRole(target.role) === 'ADMIN') {
      throw new Error('Không thể xóa mềm tài khoản ADMIN khác.');
    }

    const updated = await userRepository.update(userId, {
      is_active: false,
      deleted_at: new Date(),
      deleted_by: adminId,
      delete_reason: String(reason || '').trim() || 'Xóa mềm bởi quản trị viên',
      blocked_at: new Date(),
      blocked_by: adminId,
      block_reason: String(reason || '').trim() || 'Xóa mềm bởi quản trị viên'
    });

    const payload = typeof updated?.toObject === 'function' ? updated.toObject() : { ...updated };
    delete payload.password;
    return payload;
  }
}

export default new UserService();
