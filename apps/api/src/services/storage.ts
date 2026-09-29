import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

export function objectKeyFor(ownerId: string, assetId: string, ext: string): string {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `uploads/${ownerId}/${assetId}${safeExt}`;
}

export function publicUrl(key: string): string {
  return `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

export interface PresignedUpload {
  uploadUrl: string;
  expiresAt: string;
}

/** Presigned PUT URL for direct browser → S3 uploads. */
export async function presignPut(key: string, mimeType: string, expiresIn = 600): Promise<PresignedUpload> {
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn },
  );
  return { uploadUrl: url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

/** Presigned GET URL for private objects (thumbnails, processing downloads). */
export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
}

export async function putBuffer(key: string, body: Buffer, mimeType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mimeType }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export function keyFromUrl(url: string): string | null {
  const prefix = `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}
