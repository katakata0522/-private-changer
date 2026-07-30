const test = require("node:test");
const assert = require("node:assert/strict");
const {
  LIMITS,
  isAcceptedInputFile,
  validateSource,
  validateOutputDimensions,
  fitWithinOutputLimits,
  calculateFit,
  calculateCrop,
  sanitizeFilename,
  getMimeType,
  getExtension,
  normalizeQuality,
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
  assert.match(result.message, /5000万画素/);
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

test("sanitizes unsafe and empty filenames", () => {
  assert.equal(sanitizeFilename(' report<>:"/\\|?*.png '), "report");
  assert.equal(sanitizeFilename("photo.JPEG"), "photo");
  assert.equal(sanitizeFilename("..."), "resized-image");
  assert.equal(sanitizeFilename(""), "resized-image");
});

test("maps formats to MIME types and extensions", () => {
  assert.equal(getMimeType("jpeg"), "image/jpeg");
  assert.equal(getMimeType("png"), "image/png");
  assert.equal(getMimeType("webp"), "image/webp");
  assert.equal(getMimeType("unknown"), "image/jpeg");
  assert.equal(getExtension("webp"), ".webp");
  assert.equal(getExtension("unknown"), ".jpg");
});

test("normalizes quality values to 0.5 through 1", () => {
  assert.equal(normalizeQuality(90), 0.9);
  assert.equal(normalizeQuality(20), 0.5);
  assert.equal(normalizeQuality(120), 1);
  assert.equal(normalizeQuality("invalid"), 0.9);
});

test("formats byte counts for display", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0 MB");
  assert.equal(formatBytes(-1), "—");
});
