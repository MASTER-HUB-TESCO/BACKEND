// Credential vault APIs — store & manage login credentials for every company portal.
// Every route requires a logged-in Master Hub administrator (all Hub users are authorised MDs).
// Passwords are stored encrypted (secretbox) and are NEVER included in the list response; the
// decrypted value is returned only by the explicit per-item reveal endpoint below.
import { Router } from 'express';
import { Credential } from '../db.js';
import { requireAuth } from '../auth.js';
import { clean, ah } from '../utils.js';
import { encryptSecret, decryptSecret } from '../secretbox.js';

const r = Router();
r.use(requireAuth);

const PORTAL_TYPES = ['Web', 'Mobile App', 'Both'];
// toJSON already strips passwordEnc; add a boolean so the UI knows a password exists to reveal.
const publicCred = (c) => { const o = c.toJSON(); o.hasPassword = !!(c.passwordEnc && c.passwordEnc.data); return o; };

r.get('/', ah(async (req, res) => {
  const items = await Credential.find().sort({ appName: 1, createdAt: -1 });
  res.json({ credentials: items.map(publicCred) });
}));

// Reveal the decrypted password for ONE credential — on explicit request only, never in the list.
r.get('/:id/password', ah(async (req, res) => {
  const c = await Credential.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Credential not found' });
  res.json({ password: decryptSecret(c.passwordEnc) });
}));

r.post('/', ah(async (req, res) => {
  const appName = clean(req.body.appName);
  if (!appName) return res.status(400).json({ error: 'Application / Portal name is required' });
  const portalType = PORTAL_TYPES.includes(req.body.portalType) ? req.body.portalType : 'Web';
  const c = await Credential.create({
    appName,
    url: clean(req.body.url),
    username: clean(req.body.username),
    passwordEnc: encryptSecret(req.body.password),
    portalType,
    description: clean(req.body.description),
    createdBy: req.user.name,
    updatedBy: req.user.name,
  });
  res.json({ credential: publicCred(c) });
}));

r.put('/:id', ah(async (req, res) => {
  const c = await Credential.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Credential not found' });
  if (req.body.appName !== undefined) c.appName = clean(req.body.appName) || c.appName;
  if (req.body.url !== undefined) c.url = clean(req.body.url);
  if (req.body.username !== undefined) c.username = clean(req.body.username);
  if (req.body.portalType !== undefined && PORTAL_TYPES.includes(req.body.portalType)) c.portalType = req.body.portalType;
  if (req.body.description !== undefined) c.description = clean(req.body.description);
  // Change the password only when a new non-empty one is supplied (blank = keep existing).
  if (typeof req.body.password === 'string' && req.body.password !== '') c.passwordEnc = encryptSecret(req.body.password);
  c.updatedBy = req.user.name;
  await c.save();
  res.json({ credential: publicCred(c) });
}));

r.delete('/:id', ah(async (req, res) => {
  await Credential.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
