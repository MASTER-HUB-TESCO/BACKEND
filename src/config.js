import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function required(name, check = (v) => !!v, hint = '') {
  const v = process.env[name];
  if (!check(v)) {
    console.error(`\n[config] Missing or invalid ${name}. ${hint}\nSet it in Backend/.env (see .env.example).\n`);
    process.exit(1);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 5200),
  // Master Hub keeps its own collections (prefix mh_) and is INDEPENDENT of the existing
  // portals. You may point this at any MongoDB — a separate database is fine.
  mongoUri: required('MONGO_URI', (v) => /^mongodb(\+srv)?:\/\//.test(v || ''), 'It must be a MongoDB connection string.'),
  mongoDbName: process.env.MONGO_DB_NAME || undefined,
  collectionPrefix: process.env.COLLECTION_PREFIX || 'mh_',
  jwtSecret: required('JWT_SECRET', (v) => (v || '').length >= 32, 'Use at least 32 random characters (npm run gen:secret).'),
  // Optional dedicated key for encrypting stored credential passwords (AES-256-GCM). When unset,
  // the key is derived from JWT_SECRET. Set a long random string in production to decouple them.
  credEncKey: process.env.CRED_ENC_KEY || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtIssuer: 'tesco-master-hub',
  jwtAudience: 'tesco-master-hub-web',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  maxMds: Number(process.env.MAX_MDS || 3),      // only the authorised Managing Directors
  resetTokenTtlMin: Number(process.env.RESET_TOKEN_TTL_MIN || 60),
  appUrl: process.env.APP_URL || '',             // used to build password-reset links
  tz: process.env.TZ_NAME || 'Asia/Kolkata',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd: process.env.NODE_ENV === 'production',
  // Optional SMTP for password-reset emails. When unset, the reset link is logged to the
  // server console instead (fine for a small internal tool).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Tesco Master Hub <no-reply@tesco>',
  },
};

export const ROLES = { MD: 'md' };

// The six company systems. Seeded into the database on first run (idempotent) so the
// frontend never hardcodes a URL — everything is managed in mh_portals afterwards.
export const DEFAULT_PORTALS = [
  { key: 'erm', name: 'Tesco ERM', url: 'https://erm.tescohrmanagement.com/', icon: 'network', description: 'Enterprise resource management — company-wide resources and operations.', order: 1 },
  { key: 'hrms', name: 'Tesco HRMS', url: 'https://hrms.tescohrmanagement.com/', icon: 'users', description: 'Human resource management — employees, attendance and payroll.', order: 2 },
  { key: 'procurement', name: 'Tesco Procurement', url: 'https://procurement.tescomanagement.com/', icon: 'cart', description: 'Purchase orders, vendors, payments and procurement tracking.', order: 3 },
  { key: 'design', name: 'Tesco Design CRM', url: 'https://design.tescomanagement.com/', icon: 'ruler', description: 'Design requests, drawings, approvals and the design team.', order: 4 },
  { key: 'sales', name: 'Tesco Sales CRM', url: 'https://saleshead.tescomanagement.com/', icon: 'trending', description: 'Leads, quotations, orders and the sales pipeline.', order: 5 },
  { key: 'execution', name: 'Tesco Execution CRM', url: 'https://execution.tescomanagement.com/', icon: 'hardhat', description: 'Site execution, daily progress and material tracking.', order: 6 },
];
