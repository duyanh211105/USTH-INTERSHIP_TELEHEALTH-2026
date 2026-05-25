import multer from 'multer';
import { getStorageAdapter, sanitizeFilename, validateMedicalDocument } from '../services/storageService.js';

export function getUploadDir() {
  return getStorageAdapter().getUploadDir();
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const adapter = getStorageAdapter();
    adapter.ensureUploadDir();
    cb(null, adapter.getUploadDir());
  },
  filename(req, file, cb) {
    const safeName = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  },
});

function fileFilter(req, file, cb) {
  try {
    validateMedicalDocument(file);
    cb(null, true);
  } catch (error) {
    cb(error);
  }
}

export const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
