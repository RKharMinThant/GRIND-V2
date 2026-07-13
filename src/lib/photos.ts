import imageCompression from 'browser-image-compression'
import { PHOTO_BUCKET, supabase } from './supabase'

/** Target: light cloud storage — JPEG, long edge ≤1200px, ~300–400KB. */
const COMPRESS_OPTIONS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 0.35,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.72,
  alwaysKeepResolution: false,
}

/**
 * Compress immediately after pick — before preview or upload.
 * Always returns a JPEG File when compression succeeds.
 */
export async function compressImage(file: File): Promise<File> {
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i.test(file.name)

  if (!isImage) return file

  try {
    const compressed = await imageCompression(file, COMPRESS_OPTIONS)
    // Normalize name + type so Storage always gets image/jpeg
    const blob = compressed instanceof Blob ? compressed : new Blob([compressed])
    return new File([blob], `grind-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn('Image compression failed, using original:', err)
    // Last resort: if original is already small jpeg, keep it
    if (file.type === 'image/jpeg' && file.size < 500_000) return file
    throw new Error('Could not compress image. Try a smaller photo.')
  }
}

export async function uploadLogPhoto(
  userId: string,
  logId: string,
  file: File,
): Promise<string> {
  // Always compress at the gate — even if form already compressed (idempotent-ish)
  const compressed = await compressImage(file)
  const path = `${userId}/${logId}/${Date.now()}.jpg`

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressed, {
    cacheControl: '31536000',
    upsert: false,
    contentType: 'image/jpeg',
  })
  if (error) throw error
  return path
}

export async function deleteLogPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}

export async function getPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
