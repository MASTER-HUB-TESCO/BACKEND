// Optional convenience: create the three Managing Director accounts in one go, with
// generated passwords printed ONCE. Skips any username that already exists.
//
// Usage:
//   npm run seed:mds
//   MH_MDS="Arun:arun, Bala:bala, Chandra:chandra" npm run seed:mds
//
// You can also create the first MD from the web app's first-run setup screen and add the
// others from Settings → Managing Directors — this script is just a quicker alternative.
import 'dotenv/config';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectDB, User } from '../src/db.js';
import { config } from '../src/config.js';
import bcrypt from 'bcryptjs';

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[crypto.randomInt(chars.length)]).join('');
};

function parseList() {
  const raw = process.env.MH_MDS;
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
      const [name, user] = pair.split(':').map((x) => (x || '').trim());
      return { name: name || user, username: (user || name || '').toLowerCase().replace(/[^a-z0-9]+/g, '') };
    });
  }
  return [
    { name: 'Managing Director 1', username: 'md1' },
    { name: 'Managing Director 2', username: 'md2' },
    { name: 'Managing Director 3', username: 'md3' },
  ];
}

(async () => {
  await connectDB();
  const list = parseList().slice(0, config.maxMds);
  const created = [];
  for (const m of list) {
    if (!m.username) continue;
    if (await User.exists({ username: m.username })) { console.log(`• ${m.username} already exists — skipped`); continue; }
    const count = await User.countDocuments({ role: 'md' });
    if (count >= config.maxMds) { console.log(`• reached MAX_MDS (${config.maxMds}) — skipping ${m.username}`); continue; }
    const password = genPassword();
    await User.create({ name: m.name, username: m.username, role: 'md', title: 'Managing Director', passwordHash: await bcrypt.hash(password, config.bcryptRounds), passwordSetAt: new Date() });
    created.push({ name: m.name, username: m.username, password });
  }
  if (created.length) {
    console.log('\n=== Managing Director logins (save these now — shown once) ===');
    for (const c of created) console.log(`  ${c.name.padEnd(24)} username: ${c.username.padEnd(12)} password: ${c.password}`);
    console.log('============================================================\n');
  } else {
    console.log('\nNo new MD accounts created.\n');
  }
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
