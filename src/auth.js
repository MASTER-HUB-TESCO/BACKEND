import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from './config.js';
import { User } from './db.js';

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const checkPassword = (plain, hash) => bcrypt.compare(plain || '', hash || '');
export const MIN_PASSWORD = 8;
export function passwordProblem(pw) {
  if (!pw || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > 128) return 'Password is too long';
  return null;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user._id || user.id, role: user.role, tv: user.tokenVersion || 0 },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtExpiresIn, issuer: config.jwtIssuer, audience: config.jwtAudience }
  );
}

export async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience });
    } catch (e) {
      return res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid session, please log in again' });
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Account not active' });
    if ((user.tokenVersion || 0) !== (payload.tv || 0)) return res.status(401).json({ error: 'Session ended – please log in again' });
    req.user = user;
    next();
  } catch (e) { next(e); }
}

export const publicUser = (u) => (u ? (u.toJSON ? u.toJSON() : u) : null);

// Password-reset tokens: a random token is e-mailed/logged; only its SHA-256 hash is stored.
export const makeResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
};
export const hashResetToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
