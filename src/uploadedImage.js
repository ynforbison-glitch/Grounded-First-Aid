const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 4 * 1024 * 1024;

export function normalizeUploadedImage(input) {
  if (!input) {
    return null;
  }

  if (typeof input !== "object") {
    throwBadImage("image must be an object");
  }

  const mimeType = String(input.mime_type || input.mimeType || "").toLowerCase();
  const name = sanitizeName(input.name);
  const data = extractBase64(String(input.data || ""));

  if (!allowedMimeTypes.has(mimeType)) {
    throwBadImage("image must be a JPEG, PNG, or WebP file");
  }

  if (!data || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data)) {
    throwBadImage("image data must be base64 encoded");
  }

  const sizeBytes = Buffer.byteLength(data, "base64");
  if (sizeBytes === 0) {
    throwBadImage("image is empty");
  }

  if (sizeBytes > maxImageBytes) {
    throwBadImage("image must be 4 MB or smaller");
  }

  return Object.freeze({
    data,
    mimeType,
    name,
    sizeBytes
  });
}

export function imagePromptSummary(image) {
  if (!image) {
    return null;
  }

  return {
    present: true,
    mime_type: image.mimeType,
    name: image.name || "uploaded image",
    size_bytes: image.sizeBytes
  };
}

function extractBase64(value) {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,(.+)$/i);
  return dataUrlMatch ? dataUrlMatch[2].trim() : trimmed;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .slice(0, 120);
}

function throwBadImage(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}
