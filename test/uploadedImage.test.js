import test from "node:test";
import assert from "node:assert/strict";
import { imagePromptSummary, normalizeUploadedImage } from "../src/uploadedImage.js";

test("normalizes a supported uploaded image", () => {
  const image = normalizeUploadedImage({
    mime_type: "image/png",
    name: " wound.png ",
    data: "data:image/png;base64,aGVsbG8="
  });

  assert.equal(image.mimeType, "image/png");
  assert.equal(image.name, "wound.png");
  assert.equal(image.sizeBytes, 5);
  assert.equal(image.data, "aGVsbG8=");
});

test("rejects unsupported image types", () => {
  assert.throws(
    () =>
      normalizeUploadedImage({
        mime_type: "image/svg+xml",
        data: "PHN2Zz48L3N2Zz4="
      }),
    /JPEG, PNG, or WebP/
  );
});

test("summarizes image metadata for prompts", () => {
  const image = normalizeUploadedImage({
    mime_type: "image/jpeg",
    name: "scene.jpg",
    data: "aGVsbG8="
  });

  assert.deepEqual(imagePromptSummary(image), {
    present: true,
    mime_type: "image/jpeg",
    name: "scene.jpg",
    size_bytes: 5
  });
});
