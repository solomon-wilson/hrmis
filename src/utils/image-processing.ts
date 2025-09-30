import sharp from 'sharp';
import { ValidationError } from './validation';

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number; // for jpeg/webp
}

export async function ensureReasonableImage(buffer: Buffer): Promise<void> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new ValidationError('Invalid image: missing dimensions', []);
    }
    if (metadata.width < 50 || metadata.height < 50) {
      throw new ValidationError('Image too small', []);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Failed to parse image', []);
  }
}

export async function resizeImage(buffer: Buffer, options: ResizeOptions): Promise<Buffer> {
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();

  const target = { width: metadata.width, height: metadata.height };
  if (metadata.width && metadata.width > options.maxWidth) {
    target.width = options.maxWidth;
    target.height = undefined;
  }
  if (metadata.height && metadata.height > options.maxHeight) {
    target.height = options.maxHeight;
  }

  let pipeline = image.resize(target.width, target.height, { fit: 'inside', withoutEnlargement: true });
  if ((metadata.format === 'jpeg' || metadata.format === 'jpg') && options.quality) {
    pipeline = pipeline.jpeg({ quality: options.quality });
  } else if (metadata.format === 'png') {
    pipeline = pipeline.png();
  }
  return pipeline.toBuffer();
}


