// Makes a small preview image of a picture file, entirely in the browser.

const MAX_SOURCE_SIZE = 50 * 1024 * 1024;
const WIDTH = 480;

async function encode(canvas: OffscreenCanvas): Promise<Blob> {
  const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.75 });
  // Safari can't encode WebP and quietly returns PNG instead, so fall back to JPEG.
  return webp.type === "image/webp" ? webp : canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
}

// Returns null for files that aren't images or that the browser can't read (e.g. HEIC in Chrome).
export async function makeThumbnail(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/") || file.size > MAX_SOURCE_SIZE) return null;
  try {
    const full = await createImageBitmap(file);
    const bitmap =
      full.width > WIDTH ? await createImageBitmap(full, { resizeWidth: WIDTH, resizeQuality: "high" }) : full;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    full.close();
    bitmap.close();
    return await encode(canvas);
  } catch {
    return null;
  }
}
