/**
 * Client-side photo handling.
 *
 * A modern phone camera produces 3-5MB per shot. On a restaurant's Wi-Fi, or in
 * a basement walk-in on one bar of signal, uploading that is what makes a
 * technician give up on taking photos at all. Compressing to roughly 200KB
 * before the bytes leave the device is the difference between proof of service
 * being collected and not.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.72;

export async function compressImage(file: File): Promise<Blob> {
  // If the browser cannot decode it, send the original rather than lose the photo.
  if (typeof createImageBitmap !== "function") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** The capture timestamp is recorded client-side so it survives a delayed upload. */
export function captureTimestamp(): string {
  return new Date().toISOString();
}

export interface UploadResult { blobKey: string; bytes: number; capturedAt: string }

/**
 * Upload with backoff. Restaurant Wi-Fi drops mid-request often enough that a
 * single attempt loses photos routinely.
 */
export async function uploadPhoto(
  file: File | Blob,
  prefix: string,
  opts: { capturedAt?: string; retries?: number } = {},
): Promise<UploadResult> {
  const capturedAt = opts.capturedAt ?? captureTimestamp();
  const retries = opts.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append("file", file, "photo.jpg");
      form.append("prefix", prefix);
      form.append("capturedAt", capturedAt);
      const response = await fetch("/api/v1/photos", { method: "POST", body: form });
      if (response.ok) {
        const body = await response.json();
        return { blobKey: body.blobKey, bytes: body.bytes, capturedAt };
      }
      lastError = new Error((await response.json().catch(() => ({}))).error ?? "Upload failed");
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 2 ** attempt * 800));
  }

  throw lastError instanceof Error ? lastError : new Error("Upload failed");
}
