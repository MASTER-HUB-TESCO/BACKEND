import { config } from './config.js';
import { Notification } from './db.js';

export const clean = (v) => (typeof v === 'string' ? v.trim() : v ?? '');
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Add a centralised notification (null userId = visible to all MDs).
export async function notify({ userId = null, type = 'info', title, message = '' }) {
  if (!title) return;
  await Notification.create({ userId, type, title, message });
}

// Deliver a password-reset link. Uses SMTP when configured (nodemailer), otherwise logs
// the link to the server console — enough for a small, internal, 3-user tool.
export async function sendResetLink(user, token) {
  const base = (config.appUrl || '').replace(/\/$/, '');
  const link = base ? `${base}/reset-password?token=${token}` : `[set APP_URL to build a full link] token=${token}`;
  if (config.smtp.host && config.smtp.user) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass } });
      await transport.sendMail({ from: config.smtp.from, to: user.email || user.username, subject: 'Tesco Master Hub — password reset', text: `Hello ${user.name},\n\nReset your Master Hub password using this link (valid ${config.resetTokenTtlMin} minutes):\n${link}\n\nIf you did not request this, ignore this email.` });
      return { delivered: 'email' };
    } catch (e) {
      console.error('[reset] email failed, logging link instead:', e.message);
    }
  }
  console.log(`\n[Master Hub] Password reset for ${user.username} (${user.email || 'no email'}):\n  ${link}\n`);
  return { delivered: 'console' };
}
