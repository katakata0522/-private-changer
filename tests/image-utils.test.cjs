const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LIMITS,
  isAcceptedInputFile,
  getSourcePixelLimit,
  getOutputPixelLimit,
  validateSource,
  validateOutputDimensions,
  fitWithinOutputLimits,
  fitWithinPreviewLimits,
  calculateFit,
  calculateCrop,
  parseImageDimensions,
  sanitizeFilename,
  getMimeType,
  getExtension,
  getExtensionForMime,
  normalizeQuality,
  estimateOutputBytes,
  getUpscaleFactor,
  formatBytes
} = require("../image-utils.js");

test("accepts a supported source image within limits", () => {
  const result = validateSource({ type: "image/png", size: 1024 }, 1200, 800);
  assert.equal(result.valid, true);
});

test("accepts a known image extension when the browser omits MIME type", () => {
  assert.equal(isAcceptedInputFile({ type: "", name: "camera-photo.JPG" }), true);
  assert.equal(validateSource({ type: "", name: "camera-photo.JPG", size: 1024 }, 800, 600).valid, true);
});

test("rejects unsupported files", () => {
  const result = validateSource({ type: "image/svg+xml", size: 1024 }, 1200, 800);
  assert.equal(result.valid, false);
  assert.match(result.message, /JPG/);
});

test("rejects files over 40MB", () => {
  const result = validateSource(
    { type: "image/jpeg", size: LIMITS.maxFileBytes + 1 },
    1200,
    800
  );
  assert.equal(result.valid, false);
  assert.match(result.message, /40MB/);
});

test("rejects source images over the pixel limit", () => {
  const result = validateSource({ type: "image/jpeg", size: 1024 }, 10000, 6000);
  assert.equal(result.valid, false);
  assert.match(result.message, /3200万画素/);
});

test("uses a stricter source limit on low-memory devices", () => {
  assert.equal(getSourcePixelLimit(4), LIMITS.lowMemorySourcePixels);
  assert.equal(getSourcePixelLimit(8), LIMITS.maxSourcePixels);
  assert.equal(getSourcePixelLimit(undefined), LIMITS.maxSourcePixels);
  assert.equal(getOutputPixelLimit(4), LIMITS.lowMemoryOutputPixels);
  assert.equal(getOutputPixelLimit(8), LIMITS.maxOutputPixels);
});

test("validates safe integer output dimensions", () => {
  assert.equal(validateOutputDimensions(1200, 630).valid, true);
  assert.equal(validateOutputDimensions(0, 630).valid, false);
  assert.equal(validateOutputDimensions(1200.5, 630).valid, false);
  assert.equal(validateOutputDimensions(8193, 630).valid, false);
  assert.equal(validateOutputDimensions(5000, 5000).valid, false);
});

test("downscales initial dimensions without changing aspect ratio", () => {
  const result = fitWithinOutputLimits(8000, 6000);
  assert.ok(result.width * result.height <= LIMITS.maxOutputPixels);
  assert.ok(result.width <= LIMITS.maxSide);
  assert.ok(result.height <= LIMITS.maxSide);
  assert.ok(Math.abs(result.width / result.height - 4 / 3) < 0.001);
});

test("keeps already safe initial dimensions", () => {
  assert.deepEqual(fitWithinOutputLimits(1600, 900), { width: 1600, height: 900 });
});

test("caps preview dimensions independently from output dimensions", () => {
  const preview = fitWithinPreviewLimits(8192, 2048);
  assert.ok(preview.width <= LIMITS.maxPreviewSide);
  assert.ok(preview.width * preview.height <= LIMITS.maxPreviewPixels);
  assert.equal(preview.width / preview.height, 4);
});

test("calculates letterbox fit for a wide image", () => {
  const rect = calculateFit(1600, 900, 800, 800);
  assert.deepEqual(rect, {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1600,
    sourceHeight: 900,
    destinationX: 0,
    destinationY: 175,
    destinationWidth: 800,
    destinationHeight: 450
  });
});

test("calculates centered crop for a wide image", () => {
  const rect = calculateCrop(1600, 900, 800, 800);
  assert.equal(rect.sourceWidth, 900);
  assert.equal(rect.sourceHeight, 900);
  assert.equal(rect.sourceX, 350);
  assert.equal(rect.sourceY, 0);
  assert.equal(rect.destinationWidth, 800);
  assert.equal(rect.destinationHeight, 800);
});

test("calculates centered crop for a tall image", () => {
  const rect = calculateCrop(900, 1600, 1200, 600);
  assert.equal(rect.sourceWidth, 900);
  assert.equal(rect.sourceHeight, 450);
  assert.equal(rect.sourceX, 0);
  assert.equal(rect.sourceY, 575);
});

test("moves the crop window around a focal point without exceeding the source", () => {
  const left = calculateCrop(1600, 900, 800, 800, 0, 0.5);
  const right = calculateCrop(1600, 900, 800, 800, 1, 0.5);
  assert.equal(left.sourceX, 0);
  assert.equal(right.sourceX, 700);
  assert.equal(left.sourceY, 0);
  assert.equal(right.sourceY, 0);
});

test("reads dimensions from PNG, JPEG, WebP and BMP headers", () => {
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngView = new DataView(png.buffer);
  pngView.setUint32(16, 1200);
  pngView.setUint32(20, 630);
  assert.deepEqual(parseImageDimensions(png), { width: 1200, height: 630 });

  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x02, 0x58, 0x03, 0x20
  ]);
  assert.deepEqual(parseImageDimensions(jpeg), { width: 800, height: 600 });

  const webp = new Uint8Array(30);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  webp.set([0x56, 0x50, 0x38, 0x58], 12);
  webp.set([0xff, 0x03, 0x00, 0xf3, 0x01, 0x00], 24);
  assert.deepEqual(parseImageDimensions(webp), { width: 1024, height: 500 });

  const bmp = new Uint8Array(26);
  bmp.set([0x42, 0x4d]);
  const bmpView = new DataView(bmp.buffer);
  bmpView.setInt32(18, 640, true);
  bmpView.setInt32(22, -480, true);
  assert.deepEqual(parseImageDimensions(bmp), { width: 640, height: 480 });
  assert.equal(parseImageDimensions(Uint8Array.from([1, 2, 3])), null);
});

test("sanitizes unsafe and empty filenames", () => {
  assert.equal(sanitizeFilename(' report<>:"/\\|?*.png '), "report");
  assert.equal(sanitizeFilename("photo.JPEG"), "photo");
  assert.equal(sanitizeFilename("..."), "resized-image");
  assert.equal(sanitizeFilename(""), "resized-image");
  assert.equal(sanitizeFilename("CON.jpg"), "CON-image");
  assert.equal(sanitizeFilename("safe\u202ereport.jpg"), "safe-report");
});

test("maps formats to MIME types and extensions", () => {
  assert.equal(getMimeType("jpeg"), "image/jpeg");
  assert.equal(getMimeType("png"), "image/png");
  assert.equal(getMimeType("webp"), "image/webp");
  assert.equal(getMimeType("unknown"), "image/jpeg");
  assert.equal(getExtension("webp"), ".webp");
  assert.equal(getExtension("unknown"), ".jpg");
  assert.equal(getExtensionForMime("image/png"), ".png");
  assert.equal(getExtensionForMime("unknown"), "");
});

test("normalizes quality values to 0.4 through 1", () => {
  assert.equal(normalizeQuality(90), 0.9);
  assert.equal(normalizeQuality(20), 0.4);
  assert.equal(normalizeQuality(120), 1);
  assert.equal(normalizeQuality("invalid"), 0.9);
});

test("estimates output bytes and detects upscaling", () => {
  assert.equal(estimateOutputBytes(1000, 100, 400), 4000);
  assert.equal(estimateOutputBytes(0, 100, 400), 0);
  assert.equal(getUpscaleFactor({
    sourceWidth: 100,
    sourceHeight: 50,
    destinationWidth: 200,
    destinationHeight: 100
  }), 2);
});

test("formats byte counts for display", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
  assert.equal(formatBytes(-1), "—");
});
