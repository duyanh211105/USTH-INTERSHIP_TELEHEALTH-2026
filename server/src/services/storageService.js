import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ApiError } from '../middleware/errors.js';

const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const blockedExtensions = new Set(['.exe', '.sh', '.bat', '.cmd', '.com', '.js', '.mjs', '.ps1', '.vbs']);

export function getUploadDir() {
  return process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'server/uploads');
}

export function sanitizeFilename(originalName) {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function validateMedicalDocument(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (blockedExtensions.has(extension)) {
    throw new ApiError(400, 'Unsafe file type rejected');
  }

  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
    throw new ApiError(400, 'Only PDF, JPG, and PNG medical documents are allowed');
  }
}

function randomStorageName(originalName) {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${sanitizeFilename(originalName || 'medical-document')}`;
}

function isFirebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_STORAGE_BUCKET &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/devstorage.full_control',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsignedJwt = `${header}.${claim}`;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const signature = crypto.createSign('RSA-SHA256').update(unsignedJwt).sign(privateKey);
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new ApiError(502, 'Firebase Storage authentication failed');
  }

  return payload.access_token;
}

export function createLocalStorageAdapter() {
  return {
    provider: 'local',
    getUploadDir,
    ensureUploadDir() {
      fs.mkdirSync(getUploadDir(), { recursive: true });
    },
    async persistUploadedFile(file) {
      return {
        storageProvider: 'local',
        storageKey: file.path,
        path: file.path,
        url: this.getPublicUrl(file),
      };
    },
    getPublicUrl(file) {
      return `/uploads/${path.basename(file.path)}`;
    },
    async removeFile(filePath) {
      if (filePath && fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    },
    async removeStoredFile(document) {
      await this.removeFile(document.path || document.storageKey);
    },
  };
}

export function createFirebaseStorageAdapter() {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;

  return {
    provider: 'firebase',
    getUploadDir,
    ensureUploadDir() {
      fs.mkdirSync(getUploadDir(), { recursive: true });
    },
    async persistUploadedFile(file) {
      const accessToken = await getFirebaseAccessToken();
      const storageKey = `medical-documents/${randomStorageName(file.originalname)}`;
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(storageKey)}`;
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': file.mimetype,
        },
        body: fs.readFileSync(file.path),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new ApiError(502, payload.error?.message || 'Firebase Storage upload failed');
      }

      fs.rmSync(file.path, { force: true });

      return {
        storageProvider: 'firebase',
        storageKey,
        path: storageKey,
        url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storageKey)}?alt=media`,
      };
    },
    async removeStoredFile(document) {
      const storageKey = document.storageKey || document.path;

      if (!storageKey) {
        return;
      }

      const accessToken = await getFirebaseAccessToken();
      const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storageKey)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok && response.status !== 404) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message || 'Firebase Storage delete failed');
      }
    },
  };
}

export function getStorageAdapter(provider) {
  if (provider === 'firebase') {
    return createFirebaseStorageAdapter();
  }

  if (!provider && isFirebaseConfigured()) {
    return createFirebaseStorageAdapter();
  }

  return createLocalStorageAdapter();
}
