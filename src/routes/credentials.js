// Credential vault APIs — store & manage login credentials for every company portal.
// Every route requires a logged-in Master Hub administrator (all Hub users are authorised MDs).
// One application can hold SEVERAL logins (e.g. ERM used by 3 people), each with its own
// username + password. Passwords are stored encrypted (secretbox) and are NEVER included in the
// list response; a decrypted value is returned only by the explicit per-login reveal endpoint.
import { Router } from 'express';
import { Credential } from '../db.js';
import { requireAuth } from '../auth.js';
import { clean, ah } from '../utils.js';
import { encryptSecret, decryptSecret } from '../secretbox.js';

const r = Router();
r.use(requireAuth);

const PORTAL_TYPES = ['Web', 'Mobile App', 'Both'];

// Normalise a credential's logins — modern multi-login records, or a legacy single-login record
// (top-level username/passwordEnc) surfaced as one login with lid 'legacy'.
const loginsOf = (c) => {
  const arr = (Array.isArray(c.logins) && c.logins.length)
    ? c.logins
    : [{ lid: 'legacy', label: '', username: c.username || '', passwordEnc: c.passwordEnc }];
  return arr;
};
// Public shape: never includes any password bytes — only a flag that a password exists.
const publicCred = (c) => {
  const o = c.toJSON();
  o.logins = loginsOf(c).map((l) => ({ lid: l.lid || 'legacy', label: l.label || '', username: l.username || '', hasPassword: !!(l.passwordEnc && l.passwordEnc.data) }));
  delete o.username; // superseded by logins[]
  return o;
};

// Build the stored logins array from request input. For an edit, a login identified by its lid
// keeps its existing encrypted password when no new password is typed (blank = keep); a brand-new
// login (no lid) gets a fresh password. Reordering/removal is handled by lid, not position.
const buildLogins = (input, existing) => {
  const byLid = {};
  (existing || []).forEach((l) => { if (l && l.lid) byLid[l.lid] = l; });
  return (Array.isArray(input) ? input : [])
    .map((l) => {
      const label = clean(l.label);
      const username = clean(l.username);
      const prior = l.lid && byLid[l.lid];
      let passwordEnc;
      if (typeof l.password === 'string' && l.password !== '') passwordEnc = encryptSecret(l.password);
      else if (prior && prior.passwordEnc) passwordEnc = prior.passwordEnc;
      const out = { label, username };
      if (prior && prior.lid && prior.lid !== 'legacy') out.lid = prior.lid; // keep stable id
      if (passwordEnc) out.passwordEnc = passwordEnc;
      return out;
    })
    .filter((l) => l.username || l.label || (l.passwordEnc && l.passwordEnc.data));
};

r.get('/', ah(async (req, res) => {
  const items = await Credential.find().sort({ appName: 1, createdAt: -1 });
  res.json({ credentials: items.map(publicCred) });
}));

// Reveal the decrypted password for ONE login of a credential — explicit request only.
r.get('/:id/logins/:lid/password', ah(async (req, res) => {
  const c = await Credential.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Credential not found' });
  const l = loginsOf(c).find((x) => (x.lid || 'legacy') === req.params.lid);
  res.json({ password: decryptSecret(l && l.passwordEnc) });
}));
// Back-compat: reveal the first login's password.
r.get('/:id/password', ah(async (req, res) => {
  const c = await Credential.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Credential not found' });
  res.json({ password: decryptSecret(loginsOf(c)[0] && loginsOf(c)[0].passwordEnc) });
}));

r.post('/', ah(async (req, res) => {
  const appName = clean(req.body.appName);
  if (!appName) return res.status(400).json({ error: 'Application / Portal name is required' });
  const portalType = PORTAL_TYPES.includes(req.body.portalType) ? req.body.portalType : 'Web';
  // Accept multi-login input; fall back to a single login from legacy single fields.
  const input = Array.isArray(req.body.logins) ? req.body.logins
    : [{ label: '', username: req.body.username, password: req.body.password }];
  const logins = buildLogins(input, null);
  const c = await Credential.create({
    appName,
    url: clean(req.body.url),
    logins,
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
  if (req.body.portalType !== undefined && PORTAL_TYPES.includes(req.body.portalType)) c.portalType = req.body.portalType;
  if (req.body.description !== undefined) c.description = clean(req.body.description);
  if (req.body.logins !== undefined) {
    // Existing logins (normalised so a legacy record's password can be kept across the edit).
    c.logins = buildLogins(req.body.logins, loginsOf(c));
    c.username = ''; c.passwordEnc = undefined;  // migrate off the legacy single fields
  } else if (typeof req.body.password === 'string' && req.body.password !== '') {
    // Legacy single-password update path.
    c.logins = buildLogins([{ username: clean(req.body.username) || (loginsOf(c)[0] || {}).username, password: req.body.password }], null);
    c.username = ''; c.passwordEnc = undefined;
  }
  c.updatedBy = req.user.name;
  await c.save();
  res.json({ credential: publicCred(c) });
}));

r.delete('/:id', ah(async (req, res) => {
  await Credential.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

export default r;
