import express from 'express';
import userService from '../services/UserService.js';
import { authenticateToken } from '../middlewares/auth.js';
import upload from '../middlewares/upload.js';

const router = express.Router();

function isAdmin(req) {
  return String(req.userRole || '').toUpperCase() === 'ADMIN';
}

function isTrustedService(req) {
  const token = req.headers['x-service-token'];
  const expected = process.env.SERVICE_TOKEN || 'internal-service-token';
  return Boolean(token && token === expected);
}

router.post('/register', async (req, res) => {
  try {
    const result = await userService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await userService.login(email, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await userService.listUsersForAdmin(req.query || {});
    return res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

router.get('/internal/summary/:userId', async (req, res) => {
  try {
    if (!isTrustedService(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = await userService.getInternalUserSummary(req.params.userId);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user summary' });
  }
});

router.post('/internal/summaries', async (req, res) => {
  try {
    if (!isTrustedService(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ids = req.body?.ids || [];
    const data = await userService.getInternalUserSummaries(ids);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user summaries' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await userService.getUserProfile(req.userId);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await userService.updateProfile(req.userId, req.body);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/verify-personal-information', authenticateToken, upload.fields([
  { name: 'id_image_front', maxCount: 1 },
  { name: 'id_image_back', maxCount: 1 }
]), async (req, res) => {
  try {
    const result = await userService.verifyPersonalInformation(req.userId, req.body, req.files, req.headers.authorization);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = await userService.getUserDetailForAdmin(req.params.userId);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || 'Failed to fetch user detail' });
  }
});

router.patch('/:userId/block', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const reason = req.body?.reason || req.body?.block_reason || '';
    const data = await userService.blockUserByAdmin(req.userId, req.params.userId, reason);
    return res.json({
      success: true,
      message: 'Đã khóa tài khoản',
      data
    });
  } catch (error) {
    const message = error.message || 'Failed to block user';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

router.patch('/:userId/unblock', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = await userService.unblockUserByAdmin(req.userId, req.params.userId);
    return res.json({
      success: true,
      message: 'Đã mở khóa tài khoản',
      data
    });
  } catch (error) {
    const message = error.message || 'Failed to unblock user';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

router.delete('/:userId', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const reason = req.body?.reason || req.body?.delete_reason || '';
    const data = await userService.softDeleteUserByAdmin(req.userId, req.params.userId, reason);
    return res.json({
      success: true,
      message: 'Đã xóa mềm tài khoản',
      data
    });
  } catch (error) {
    const message = error.message || 'Failed to delete user';
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

export default router;
