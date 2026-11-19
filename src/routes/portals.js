import { Router } from 'express';
import { Portal, Recent } from '../db.js';
import { requireAuth } from '../auth.js';
import { clean, ah, notify } from '../utils.js';

const r = Router();
r.use(requireAuth);

// All portal cards — names, URLs and status come from the DB (never hardcoded in the UI).
r.get('/', ah(async (req, res) => {
  const portals = await Portal.find().sort({ order: 1, name: 1 });
  res.json({ portals: portals.map((p) => p.toJSON()) });
}));

// Update a portal (URL, status, name, description, icon). Any MD may manage portals.
r.put('/:id', ah(async (req, res) => {
  const p = await Portal.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Portal not found' });
  const before = p.status;
  if (req.body.name !== undefined) p.name = clean(req.body.name) || p.name;
  if (req.body.url !== undefined) {
    const url = clean(req.body.url);
    if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL must start with http:// or https://' });
    if (url) p.url = url;
  }
  if (req.body.description !== undefined) p.description = clean(req.body.description);
  if (req.body.icon !== undefined) p.icon = clean(req.body.icon) || p.icon;
  if (req.body.status !== undefined) p.status = req.body.status === 'Inactive' ? 'Inactive' : 'Active';
  if (req.body.order !== undefined && req.body.order !== '') p.order = Number(req.body.order) || p.order;
  p.updatedBy = req.user.name;
  await p.save();
  if (before !== p.status) await notify({ type: 'portal', title: `${p.name} is now ${p.status}`, message: `Status changed by ${req.user.name}.` });
  res.json({ portal: p.toJSON() });
}));

// Record that an MD opened a portal (for "Recently accessed") and return the live URL.
r.post('/:id/access', ah(async (req, res) => {
  const p = await Portal.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Portal not found' });
  await Recent.create({ userId: req.user._id, portalId: p._id, portalKey: p.key, portalName: p.name });
  // keep only the latest 50 per user
  const old = await Recent.find({ userId: req.user._id }).sort({ at: -1 }).skip(50).select('_id');
  if (old.length) await Recent.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  res.json({ url: p.url, status: p.status });
}));

export default r;
