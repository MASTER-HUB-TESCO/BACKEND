import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { config, ROOT } from './config.js';
import { connectDB, dbState } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import portalRoutes from './routes/portals.js';
import dashboardRoutes from './routes/dashboard.js';
import credentialRoutes from './routes/credentials.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.status(dbState() === 'connected' ? 200 : 503).json({ ok: dbState() === 'connected', db: dbState() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/portals', portalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built frontend when present (single-server production).
const dist = path.resolve(ROOT, '../Frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.code === 11000) return res.status(400).json({ error: 'That value is already in use' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: 'Invalid data' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

async function start() {
  try {
    const db = await connectDB();
    console.log(`MongoDB connected → database "${db.databaseName}" (collections prefixed "${config.collectionPrefix}")`);
  } catch (e) {
    console.error('\n[MongoDB] Could not connect:', e.message, '\nCheck MONGO_URI in Backend/.env and that this IP is allowed in Atlas → Network Access.\n');
    process.exit(1);
  }
  const server = app.listen(config.port, () => console.log(`Tesco Master Hub API running on http://localhost:${config.port}`));
  const stop = async () => { server.close(); await mongoose.connection.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
start();
