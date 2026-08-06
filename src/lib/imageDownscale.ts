// Client-side downscale of receipt photos before upload. The frontend
// uploads through the Payload REST API (the server), and Vercel serverless
// caps request bodies at ~4.5 MB — phone photos exceed that. Receipts don't
// need full resolution, so shrink to a sane size in the browser first.
// Falls back to the original file whenever anything fails (unsupported
// format, canvas errors) — small originals still upload fine.

const MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.85
/** Files at or below this size are uploaded untouched. */
const SKIP_BELOW_BYTES = 700 * 1024

export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= SKIP_BELOW_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[a-z0-9]+$/i, '') || 'uctenka'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
