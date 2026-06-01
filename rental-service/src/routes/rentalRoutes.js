import express from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import rentalService from '../services/RentalService.js';

const router = express.Router();

function isAdmin(req) {
  return String(req.userRole || '').toUpperCase() === 'ADMIN';
}

function isInternalRequest(req) {
  const headerToken = req.headers['x-service-token'];
  const expectedToken = process.env.SERVICE_TOKEN || 'internal-service-token';
  return String(headerToken || '') === String(expectedToken || '');
}

function sendError(res, error, fallbackMessage) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || fallbackMessage || 'Request failed',
    error: error.message || fallbackMessage || 'Request failed'
  });
}

router.get('/internal/:rentalId', async (req, res) => {
  try {
    if (!isInternalRequest(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const rental = await rentalService.getRentalById(req.params.rentalId);
    if (!rental) {
      return res.status(404).json({ success: false, error: 'Rental not found' });
    }
    return res.json({ success: true, data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy rental nội bộ');
  }
});

router.post('/request', authenticateToken, async (req, res) => {
  try {
    const rentalRequest = await rentalService.createRentalRequest(req.userId, req.body);
    return res.status(201).json({
      success: true,
      message: 'Gửi yêu cầu thuê thành công',
      data: rentalRequest
    });
  } catch (error) {
    return sendError(res, error, 'Không thể tạo yêu cầu thuê');
  }
});

router.get('/renter/my-rentals', authenticateToken, async (req, res) => {
  try {
    const rentals = await rentalService.getRenterRentals(req.userId);
    return res.json({ success: true, data: rentals });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy danh sách thuê của người thuê');
  }
});

router.get('/my-requests', authenticateToken, async (req, res) => {
  try {
    const rentals = await rentalService.getRenterRentals(req.userId);
    return res.json({ success: true, data: rentals });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy danh sách yêu cầu thuê');
  }
});

router.get('/owner/my-rentals', authenticateToken, async (req, res) => {
  try {
    const rentals = await rentalService.getOwnerRentals(req.userId);
    return res.json({ success: true, data: rentals });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy danh sách thuê của chủ xe');
  }
});

router.get('/owner-requests', authenticateToken, async (req, res) => {
  try {
    const rentals = await rentalService.getOwnerRentals(req.userId);
    return res.json({ success: true, data: rentals });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy danh sách yêu cầu cho chủ xe');
  }
});

router.get('/admin/list', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const rentals = await rentalService.getAdminRentals(req.query || {}, { limit: req.query.limit || 0 });
    return res.json({ success: true, data: rentals });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy danh sách rental cho admin');
  }
});

router.patch('/:rentalId/approve', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.approveRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã duyệt yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể duyệt yêu cầu thuê');
  }
});

router.put('/:rentalId/confirm', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.approveRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã duyệt yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể duyệt yêu cầu thuê');
  }
});

router.patch('/:rentalId/reject', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.rejectRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã từ chối yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể từ chối yêu cầu thuê');
  }
});

router.put('/:rentalId/reject', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.rejectRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã từ chối yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể từ chối yêu cầu thuê');
  }
});

router.patch('/:rentalId/confirm-pickup', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.confirmPickup(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã xác nhận nhận xe', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể xác nhận nhận xe');
  }
});

router.patch('/:rentalId/return', authenticateToken, async (req, res) => {
  try {
    // Demo mode: cho phép renter trả xe ngay khi rental đang ACTIVE.
    const rental = await rentalService.requestReturn(req.params.rentalId, req.userId);
    return res.json({
      success: true,
      message: 'Đã gửi yêu cầu xác nhận trả xe. Vui lòng chờ chủ xe xác nhận.',
      data: rental
    });
  } catch (error) {
    return sendError(res, error, 'Không thể gửi yêu cầu trả xe');
  }
});

router.patch('/:rentalId/confirm-return', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.confirmReturn(req.params.rentalId, req.userId);
    return res.json({
      success: true,
      message: 'Đã xác nhận nhận lại xe, chuyến thuê hoàn tất',
      data: rental
    });
  } catch (error) {
    return sendError(res, error, 'Không thể xác nhận nhận lại xe');
  }
});

router.patch('/:rentalId/dispute', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.markDisputed(
      req.params.rentalId,
      req.userId,
      req.body?.reason || req.body?.note || ''
    );
    return res.json({ success: true, message: 'Đã chuyển trạng thái tranh chấp', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể tạo tranh chấp');
  }
});

router.patch('/:rentalId/cancel', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.cancelRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã hủy yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể hủy yêu cầu thuê');
  }
});

router.put('/:rentalId/cancel', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.cancelRental(req.params.rentalId, req.userId);
    return res.json({ success: true, message: 'Đã hủy yêu cầu thuê', data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể hủy yêu cầu thuê');
  }
});

router.get('/:rentalId', authenticateToken, async (req, res) => {
  try {
    const rental = await rentalService.getRentalById(req.params.rentalId);
    return res.json({ success: true, data: rental });
  } catch (error) {
    return sendError(res, error, 'Không thể lấy chi tiết rental');
  }
});

router.post('/check-availability', authenticateToken, async (req, res) => {
  try {
    const startDate = req.body.start_date || req.body.rental_start_date;
    const endDate = req.body.end_date || req.body.rental_end_date;
    const available = await rentalService.checkAvailability(req.body.vehicle_id, startDate, endDate);
    return res.json({ success: true, available });
  } catch (error) {
    return sendError(res, error, 'Không thể kiểm tra lịch trống');
  }
});

export default router;
