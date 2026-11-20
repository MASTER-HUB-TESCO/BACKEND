import { Router } from 'express';
import { Portal, Recent, Credential, Notification } from '../db.js';
import { requireAuth } from '../auth.js';
import { ah } from '../utils.js';

const r = Router();
r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const [portals, recentRaw, credentialCount, notifUnread] = await Promise.all([
    Portal.find().sort({ order: 1, name: 1 }),
    Recent.find({ userId: req.user._id }).sort({ at: -1 }).limit(30),
    Credential.countDocuments(),
    Notification.countDocuments({ $or: [{ userId: req.user._id }, { userId: null }], read: false }),
  ]);
  // de-duplicate recent portals (latest access per portal), keep up to 6
  const seen = new Set();
  const recent = [];
  for (const rec of recentRaw) {
    if (seen.has(rec.portalKey)) continue;
    seen.add(rec.portalKey);
    const p = portals.find((x) => String(x._id) === String(rec.portalId) || x.key === rec.portalKey);
    recent.push({ id: rec.portalId, key: rec.portalKey, name: rec.portalName, at: rec.at, icon: p ? p.icon : 'grid', url: p ? p.url : '', status: p ? p.status : 'Inactive' });
    if (recent.length >= 6) break;
  }
  const active = portals.filter((p) => p.status === 'Active').length;
  res.json({
    stats: { total: portals.length, active, inactive: portals.length - active },
    portals: portals.map((p) => p.toJSON()),
    recent,
    credentialCount,
    unread: notifUnread,
  });
}));

export default r;
