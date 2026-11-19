import { Router } from 'express';
import { Notification } from '../db.js';
import { requireAuth } from '../auth.js';
import { ah } from '../utils.js';

const r = Router();
r.use(requireAuth);

const mine = (user) => ({ $or: [{ userId: user._id }, { userId: null }] });

r.get('/', ah(async (req, res) => {
  const items = await Notification.find(mine(req.user)).sort({ createdAt: -1 }).limit(100);
  const out = items.map((n) => n.toJSON());
  res.json({ items: out, unread: out.filter((n) => !n.read).length });
}));

r.post('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ ...mine(req.user), read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

r.post('/:id/read', ah(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, ...mine(req.user) }, { $set: { read: true } });
  res.json({ ok: true });
}));

export default r;
