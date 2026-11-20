// MongoDB (Mongoose) data layer for Tesco Master Hub. All collections are prefixed "mh_"
// and are completely independent of the existing portals — the Hub never touches their data.
import mongoose from 'mongoose';
import crypto from 'crypto';
import { config, DEFAULT_PORTALS } from './config.js';

const P = config.collectionPrefix;
export const newId = () => crypto.randomUUID();

const toJSON = {
  virtuals: false,
  versionKey: false,
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.resetTokenHash;
    delete ret.resetTokenExp;
    delete ret.passwordEnc;   // encrypted credential password never leaves via JSON
    return ret;
  },
};
const opts = (c) => ({ collection: P + c, timestamps: true, toJSON, toObject: toJSON });
const idField = { type: String, default: newId };

// ── Managing Director accounts (only the authorised MDs) ──
const userSchema = new mongoose.Schema({
  _id: idField,
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  title: { type: String, default: 'Managing Director' },
  role: { type: String, default: 'md' },
  active: { type: Boolean, default: true },
  passwordHash: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 },
  mustChangePassword: { type: Boolean, default: false },
  passwordSetAt: Date,
  lastLogin: Date,
  resetTokenHash: { type: String, default: null },
  resetTokenExp: { type: Date, default: null },
  createdBy: String,
}, opts('users'));

// ── Portal cards (names, URLs, status — all managed in the DB) ──
const portalSchema = new mongoose.Schema({
  _id: idField,
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: 'grid' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  order: { type: Number, default: 0 },
  updatedBy: String,
}, opts('portals'));

// ── Application / portal login credentials (passwords stored ENCRYPTED, never plain text) ──
const credentialSchema = new mongoose.Schema({
  _id: idField,
  appName: { type: String, required: true, trim: true },   // Application / Portal name
  url: { type: String, default: '', trim: true },          // Portal URL
  username: { type: String, default: '', trim: true },     // Login username / email
  // AES-256-GCM encrypted password blob. Stripped from every toJSON response; revealed only
  // on an explicit, authenticated per-item request.
  passwordEnc: { iv: String, tag: String, data: String },
  portalType: { type: String, enum: ['Web', 'Mobile App', 'Both'], default: 'Web' },
  description: { type: String, default: '' },
  createdBy: String,
  updatedBy: String,
}, opts('credentials'));

// ── Centralised notifications ──
const notificationSchema = new mongoose.Schema({
  _id: idField,
  userId: { type: String, default: null, index: true }, // null = all MDs
  type: { type: String, default: 'info' },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  read: { type: Boolean, default: false },
}, opts('notifications'));

// ── Recently accessed portals (per MD) ──
const recentSchema = new mongoose.Schema({
  _id: idField,
  userId: { type: String, index: true },
  portalId: String,
  portalKey: String,
  portalName: String,
  at: { type: Date, default: Date.now },
}, opts('recent'));

export const User = mongoose.model('MhUser', userSchema);
export const Portal = mongoose.model('MhPortal', portalSchema);
export const Credential = mongoose.model('MhCredential', credentialSchema);
export const Notification = mongoose.model('MhNotification', notificationSchema);
export const Recent = mongoose.model('MhRecent', recentSchema);

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName, serverSelectionTimeoutMS: 15000, maxPoolSize: 20 });
  await Promise.all([User, Portal, Credential, Notification, Recent].map((m) => m.syncIndexes()));
  await seedPortals();
  return mongoose.connection.db;
}

// Seed the six portals once (idempotent). Existing rows are never overwritten, so any
// URL/status an MD changes in the DB is preserved.
export async function seedPortals() {
  for (const p of DEFAULT_PORTALS) {
    await Portal.updateOne({ key: p.key }, { $setOnInsert: { _id: newId(), status: 'Active', ...p } }, { upsert: true });
  }
}

export const dbState = () => ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
