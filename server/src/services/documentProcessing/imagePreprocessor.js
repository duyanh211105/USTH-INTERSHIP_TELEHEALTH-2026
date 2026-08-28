import fs from 'node:fs/promises';
import { DocumentProcessingError } from './documentProcessingError.js';

const minimumUsefulWidth = 1200;
const maximumUsefulWidth = 2400;

async function toInputBuffer(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof Uint8Array) {
    return Buffer.from(input);
  }

  return fs.readFile(input);
}

export async function preprocessImage(input, options = {}) {
  try {
    const sharp = (await import('sharp')).default;
    const buffer = await toInputBuffer(input);
    const image = sharp(buffer, { failOn: 'warning' }).rotate();
    const metadata = await image.metadata();
    const width = Number(metadata.width || 0);
    let pipeline = image.grayscale().normalize();

    if (width > 0 && width < minimumUsefulWidth) {
      pipeline = pipeline.resize({
        width: options.upscaleWidth || minimumUsefulWidth,
        withoutEnlargement: false,
      });
    } else if (width > maximumUsefulWidth) {
      pipeline = pipeline.resize({
        width: options.maxWidth || maximumUsefulWidth,
        withoutEnlargement: true,
      });
    }

    pipeline = pipeline.sharpen({ sigma: 1 });

    if (options.threshold === true) {
      pipeline = pipeline.threshold(options.thresholdValue || 180);
    }

    return pipeline.png().toBuffer();
  } catch (error) {
    throw new DocumentProcessingError(
      'Unable to preprocess image for OCR',
      error?.code || 'IMAGE_PREPROCESSING_FAILED',
    );
  }
}
