// Create OR reset a single Managing Director login with chosen credentials.
// Idempotent: if the username/email already exists, its password is reset (and it is
// re-enabled). Respects MAX_MDS when creating a new account.
//
// PowerShell (Windows):
//   $env:MH_USER="tescostructures@gmail.com"; $env:MH_PASS="Tescostr@123"; $env:MH_NAME="Tesco MD"; node scripts/create-md.js
// macOS / Linux:
//   MH_USER="tescostructures@gmail.com" MH_PASS="Tescostr@123" MH_NAME="Tesco MD" node scripts/create-md.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB, User } from '../src/db.js';
import { config } from '../src/config.js';

const user = String(process.env.MH_USER || '').trim().toLowerCase();
const pass = String(process.env.MH_PASS || '');
const name = String(process.env.MH_NAME || 'Managing Director').trim();
const email = String(process.env.MH_EMAIL || (user.includes('@') ? user : '')).trim().toLowerCase();

if (!user || !pass) {
  console.error('\nSet MH_USER and MH_PASS. Example (PowerShell):\n  $env:MH_USER="tescostructures@gmail.com"; $env:MH_PASS="Tescostr@123"; node scripts/create-md.js\n');
  process.exit(1);
}
if (pass.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }

(async () => {
  await connectDB();
  const hash = await bcrypt.hash(pass, config.bcryptRounds);
  let u = await User.findOne({ $or: [{ username: user }, { email: email || '___none___' }] });
  if (u) {
    u.passwordHash = hash;
    u.active = true;
    u.mustChangePassword = false;
    u.tokenVersion = (u.tokenVersion || 0) + 1;
    u.passwordSetAt = new Date();
    if (email) u.email = email;
    await u.save();
    console.log(`\n✓ Password reset for existing MD "${u.username}". You can now sign in.\n`);
  } else {
    const count = await User.countDocuments({ role: 'md' });
    if (count >= config.maxMds) { console.error(`\nMAX_MDS (${config.maxMds}) reached. Reset an existing account instead, or raise MAX_MDS in .env.\n`); process.exit(1); }
    u = await User.create({ name, username: user, email, role: 'md', title: 'Managing Director', passwordHash: hash, passwordSetAt: new Date() });
    console.log(`\n✓ Created MD "${u.username}". You can now sign in.\n`);
  }
  console.log(`   Sign in with:  username/email: ${u.username}${u.email && u.email !== u.username ? ' (or ' + u.email + ')' : ''}`);
  console.log('   Password: the one you just set.\n');
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
