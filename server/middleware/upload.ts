import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const uploadDir = path.resolve(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage(); // store in memory first to verify magic bytes

export const uploadAvatarMiddleware = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
}).single('avatar');

export function validateImageMagicBytes(buffer: Buffer): { valid: boolean; ext: string } {
  if (buffer.length < 12) return { valid: false, ext: '' };

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, ext: 'png' };
  }

  // WEBP: RIFF....WEBP
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { valid: true, ext: 'webp' };
  }

  return { valid: false, ext: '' };
}

export function saveAvatarFile(userId: string, buffer: Buffer, ext: string): string {
  const filename = `avatar_${userId}_${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, filename);

  // Remove any previous avatars for this user
  try {
    const existingFiles = fs.readdirSync(uploadDir);
    for (const f of existingFiles) {
      if (f.startsWith(`avatar_${userId}_`)) {
        fs.unlinkSync(path.join(uploadDir, f));
      }
    }
  } catch {
    // Ignore error
  }

  fs.writeFileSync(filePath, buffer);
  return `/uploads/avatars/${filename}`;
}
