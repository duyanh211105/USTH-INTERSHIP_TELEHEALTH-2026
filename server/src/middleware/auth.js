import jwt from 'jsonwebtoken';
import { findUserById } from '../services/userService.js';
import { ApiError } from './errors.js';

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'development-secret-change-me';
}

export async function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing bearer token'));
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await findUserById(payload.sub);

    if (!user) {
      return next(new ApiError(401, 'Invalid token user'));
    }

    if (user.status === 'INACTIVE') {
      return next(new ApiError(403, 'Account is inactive'));
    }

    req.user = user;
    return next();
  } catch {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}
