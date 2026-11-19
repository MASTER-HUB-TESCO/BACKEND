import { Router } from 'express';
import { Announcement } from '../db.js';
import { requireAuth } from '../auth.js';
import { clean, ah, notify } from '../utils.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const items = await Announcement.find().sort({ pinned: -1, createdAt: -1 });
  res.json({ announcements: items.map((a) => a.toJSON()) });
}));

r.post('/', ah(async (req, res) => {
  const title = clean(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const a = await Announcement.create({ title, body: clean(req.body.body), author: req.user.name, pinned: !!req.body.pinned });
  await notify({ type: 'announcement', title: 'New announcement', message: title });
  res.json({ announcement: a.toJSON() });
}));

r.put('/:id', ah(async (req, res) => {
  const a = await Announcement.findById(req.params.id);
  if (!a) return res.status(404).json({ error: 'Announcement not found' });
  if (req.body.title !== undefined) a.title = clean(req.body.title) || a.title;
  if (req.body.body !== undefined) a.body = clean(req.body.body);
  if (req.body.pinned !== undefined) a.pinned = !!req.body.pinned;
  await a.save();
  res.json({ announcement: a.toJSON() });
}));

r.delete('/:id', ah(async (req, res) => {
  await Announcement.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
