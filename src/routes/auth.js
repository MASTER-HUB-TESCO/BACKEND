import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../db.js';
import { config, ROLES } from '../config.js';
import { signToken, requireAuth, hashPassword, checkPassword, passwordProblem, publicUser, makeResetToken, hashResetToken } from '../auth.js';
import { clean, ah, sendResetLink } from '../utils.js';

const r = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please wait 15 minutes and try again.' } });

// Is the very first MD account still to be created? (No public registration — the first
// run creates the first Managing Director, who then adds the others, up to MAX_MDS.)
r.get('/setup-status', ah(async (req, res) => {
  res.json({ needsSetup: !(await User.exists({ role: ROLES.MD })) });
}));

r.post('/setup', loginLimiter, ah(async (req, res) => {
  if (await User.exists({ role: ROLES.MD })) return res.status(400).json({ error: 'Setup already completed' });
  const name = clean(req.body.name);
  const username = clean(req.body.username).toLowerCase();
  const password = req.body.password || '';
  if (!name || !username) return res.status(400).json({ error: 'Name and username are required' });
  const bad = passwordProblem(password);
  if (bad) return res.status(400).json({ error: bad });
  const user = await User.create({
    name, username, email: clean(req.body.email), phone: clean(req.body.phone),
    role: ROLES.MD, title: 'Managing Director', passwordHash: await hashPassword(password), passwordSetAt: new Date(),
  });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

r.post('/login', loginLimiter, ah(async (req, res) => {
  const id = clean(req.body.username).toLowerCase();
  if (!id || !req.body.password) return res.status(400).json({ error: 'Enter your username and password' });
  const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
  const ok = user && (await checkPassword(req.body.password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
  if (!user.active) return res.status(403).json({ error: 'Your account is disabled. Contact another Managing Director.' });
  user.lastLogin = new Date();
  await user.save();
  res.json({ token: signToken(user), user: publicUser(user) });
}));

r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

r.post('/change-password', requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!(await checkPassword(currentPassword, req.user.passwordHash))) return res.status(400).json({ error: 'Current password is wrong' });
  const bad = passwordProblem(newPassword);
  if (bad) return res.status(400).json({ error: bad });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'New password must be different' });
  req.user.passwordHash = await hashPassword(newPassword);
  req.user.mustChangePassword = false;
  req.user.passwordSetAt = new Date();
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
  await req.user.save();
  res.json({ ok: true, token: signToken(req.user), user: publicUser(req.user) });
}));

// Forgot password — always returns a generic message (never reveals whether an account
// exists). A reset link is e-mailed (if SMTP configured) or logged to the server console.
r.post('/forgot-password', loginLimiter, ah(async (req, res) => {
  const id = clean(req.body.username).toLowerCase();
  const generic = { ok: true, message: 'If that account exists, password reset instructions have been sent.' };
  if (!id) return res.json(generic);
  const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
  if (user && user.active) {
    const { token, hash } = makeResetToken();
    user.resetTokenHash = hash;
    user.resetTokenExp = new Date(Date.now() + config.resetTokenTtlMin * 60 * 1000);
    await user.save();
    await sendResetLink(user, token);
  }
  res.json(generic);
}));

r.post('/reset-password', loginLimiter, ah(async (req, res) => {
  const token = clean(req.body.token);
  const newPassword = req.body.newPassword || '';
  if (!token) return res.status(400).json({ error: 'Invalid or missing reset token' });
  const bad = passwordProblem(newPassword);
  if (bad) return res.status(400).json({ error: bad });
  const user = await User.findOne({ resetTokenHash: hashResetToken(token), resetTokenExp: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  user.passwordHash = await hashPassword(newPassword);
  user.resetTokenHash = null;
  user.resetTokenExp = null;
  user.mustChangePassword = false;
  user.passwordSetAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ ok: true, token: signToken(user), user: publicUser(user) });
}));

export default r;
