import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const jwtAlgorithm = process.env.JWT_ALGORITHM || 'RS256';

function resolvePublicKey() {
  const inlinePublicKey = process.env.JWT_PUBLIC_KEY;
  if (inlinePublicKey) {
    return inlinePublicKey.replace(/\\n/g, '\n');
  }

  const publicKeyPath = path.resolve(process.env.JWT_PUBLIC_KEY_PATH || './keys/public.key');
  try {
    return fs.readFileSync(publicKeyPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read JWT public key. Set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH. Tried: ${publicKeyPath}`
    );
  }
}

const publicKey = resolvePublicKey();

export const authenticateToken = (req, res, next) => {
  // Check for service token (service-to-service communication)
  const serviceToken = req.headers['x-service-token'];
  if (serviceToken && serviceToken === process.env.SERVICE_TOKEN) {
    req.isService = true;
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No token provided'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: [jwtAlgorithm]
    });

    req.userId =  decoded.id;
    req.userRole = decoded.role;
    req.user = decoded;

    if (!req.userId) {
      return res.status(401).json({
        error: 'Token does not contain user id'
      });
    }

    next();
  } catch (error) {
    return res.status(403).json({
      error: 'Invalid or expired token'
    });
  }
};
