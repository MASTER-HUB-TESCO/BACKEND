import { Router } from 'express';
import { User } from '../db.js';
import { config, ROLES } from '../config.js';
import { requireAuth, hashPassword, passwordProblem, publicUser } from '../auth.js';
import { clean, ah } from '../utils.js';

const r = Router();
r.use(requireAuth); // every route here is MD-only (all accounts are MDs)

const usernameFromName = (name) => clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'md';
async function uniqueUsername(base) { let u = base, i = 1; while (await User.exists({ username: u })) u = `${base}${++i}`; return u; }
function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

r.get('/', ah(async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ users: users.map(publicUser), max: config.maxMds });
}));

// Add another Managing Director (no public registration; capped at MAX_MDS).
r.post('/', ah(async (req, res) => {
  const count = await User.countDocuments({ role: ROLES.MD });
  if (count >= config.maxMds) return res.status(400).json({ error: `Only ${config.maxMds} Managing Director accounts are allowed.` });
  const name = clean(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  let username = clean(req.body.username).toLowerCase();
  if (username) { if (await User.exists({ username })) return res.status(400).json({ error: 'That username is already taken' }); }
  else username = await uniqueUsername(usernameFromName(name));
  const password = req.body.password || genPassword();
  const bad = passwordProblem(password);
  if (bad) return res.status(400).json({ error: bad });
  const user = await User.create({
    name, username, email: clean(req.body.email), phone: clean(req.body.phone),
    title: clean(req.body.title) || 'Managing Director', role: ROLES.MD,
    passwordHash: await hashPassword(password), mustChangePassword: !!req.body.mustChangePassword, passwordSetAt: new Date(), createdBy: req.user._id,
  });
  res.json({ user: publicUser(user), credentials: { username, password } });
}));

r.put('/:id', ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  ['name', 'email', 'phone', 'title'].forEach((k) => { if (req.body[k] !== undefined) user[k] = clean(req.body[k]); });
  await user.save();
  res.json({ user: publicUser(user) });
}));

r.post('/:id/reset-password', ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const password = req.body.password || genPassword();
  const bad = passwordProblem(password);
  if (bad) return res.status(400).json({ error: bad });
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = !!req.body.mustChangePassword;
  user.passwordSetAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ ok: true, credentials: { username: user.username, password } });
}));

r.post('/:id/active', ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user._id === req.user._id) return res.status(400).json({ error: 'You cannot disable your own account' });
  user.active = !!req.body.active;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.json({ user: publicUser(user) });
}));

export default r;
