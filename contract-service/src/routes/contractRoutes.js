import express from 'express';
import contractService from '../services/ContractService.js';
import { authenticateToken } from '../middlewares/auth.js';
import upload from '../middlewares/upload.js';

const router = express.Router();

function isAdmin(req) {
  return String(req.userRole || '').toUpperCase() === 'ADMIN';
}

function isTrustedService(req) {
  const token = req.headers['x-service-token'];
  const expectedToken = process.env.SERVICE_TOKEN || 'internal-service-token';
  return token && token === expectedToken;
}

router.get('/admin/list', authenticateToken, async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contracts = await contractService.getAdminContracts(req.query || {}, {
      limit: req.query.limit || 0
    });

    return res.json({
      success: true,
      data: contracts
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch admin contracts' });
  }
});

router.post('/internal/create', async (req, res) => {
  try {
    if (!isTrustedService(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contract = await contractService.createContractIfNotExists(req.body || {});
    return res.status(201).json({
      success: true,
      data: contract
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.patch('/internal/:contractId/cancel-saga', async (req, res) => {
  try {
    if (!isTrustedService(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contract = await contractService.cancelContractBySaga(
      req.params.contractId,
      req.body?.reason || 'Saga compensation'
    );
    return res.json({
      success: true,
      data: contract
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:contractId', authenticateToken, async (req, res) => {
  try {
    const contract = await contractService.getContractById(req.params.contractId);
    res.json(contract);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/:contractId/pickup', authenticateToken, upload.fields([{ name: 'pickup_images', maxCount: 10 }]), async (req, res) => {
  try {
    const contract = await contractService.pickupVehicle(req.params.contractId, req.files.pickup_images, req.body, req.headers.authorization);
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:contractId/return', authenticateToken, upload.fields([{ name: 'return_images', maxCount: 10 }]), async (req, res) => {
  try {
    const contract = await contractService.returnVehicle(req.params.contractId, req.files.return_images, req.body, req.headers.authorization);
    
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:contractId/cancel', authenticateToken, async (req, res) => {
  try {
    const contract = await contractService.cancelContract(
      req.params.contractId,
      req.userId,
      req.body
    );
    res.json(contract);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/renter/my-contracts', authenticateToken, async (req, res) => {
  try {
    const contracts = await contractService.getRenterContracts(req.userId);
    res.json(contracts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/owner/my-contracts', authenticateToken, async (req, res) => {
  try {
    const contracts = await contractService.getOwnerContracts(req.userId);
    res.json(contracts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
