(function exposeImageUtils(globalScope) {
  "use strict";

  const LIMITS = Object.freeze({
    maxFileBytes: 40 * 1024 * 1024,
    maxSourcePixels: 32_000_000,
    lowMemorySourcePixels: 24_000_000,
    maxOutputPixels: 16_777_216,
    lowMemoryOutputPixels: 8_388_608,
    maxSide: 8192,
    maxPreviewPixels: 1_500_000,
    maxPreviewSide: 1600,
    maxHeaderBytes: 1024 * 1024
  });

  const MIME_TYPES = Object.freeze({
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  });

  const EXTENSIONS = Object.freeze({
    jpeg: ".jpg",
    png: ".png",
    webp: ".webp"
  });

  const MIME_EXTENSIONS = Object.freeze({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  });

  const ACCEPTED_INPUT_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp"
  ]);

  function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function isAcceptedInputFile(file) {
    if (!file) return false;
    if (ACCEPTED_INPUT_TYPES.has(file.type)) return true;
    return /\.(jpe?g|png|webp|bmp)$/i.test(file.name || "");
  }

  function getSourcePixelLimit(deviceMemory) {
    const memory = Number(deviceMemory);
    return Number.isFinite(memory) && memory <= 4
      ? LIMITS.lowMemorySourcePixels
      : LIMITS.maxSourcePixels;
  }

  function getOutputPixelLimit(deviceMemory) {
    const memory = Number(deviceMemory);
    return Number.isFinite(memory) && memory <= 4
      ? LIMITS.lowMemoryOutputPixels
      : LIMITS.maxOutputPixels;
  }

  function validateSource(file, width, height, maxPixels = LIMITS.maxSourcePixels) {
    if (!file) return { valid: false, message: "画像ファイルを選択してください。" };
    if (!isAcceptedInputFile(file)) {
      return { valid: false, message: "JPG、PNG、WebP、BMP形式の画像を選択してください。" };
    }
    if (file.size > LIMITS.maxFileBytes) {
      return { valid: false, message: "40MB以下の画像を選択してください。" };
    }
    if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
      return { valid: false, message: "画像の縦横サイズを読み取れませんでした。" };
    }
    if (width * height > maxPixels) {
      const megapixels = Math.floor(maxPixels / 1_000_000);
      return {
        valid: false,
        message: `この端末では${megapixels}00万画素以下の画像を選択してください。`
      };
    }
    return { valid: true, message: "" };
  }

  function validateOutputDimensions(width, height, maxPixels = LIMITS.maxOutputPixels) {
    const normalizedWidth = Number(width);
    const normalizedHeight = Number(height);

    if (!Number.isInteger(normalizedWidth) || !Number.isInteger(normalizedHeight)) {
      return { valid: false, message: "幅と高さは整数で入力してください。" };
    }
    if (normalizedWidth < 1 || normalizedHeight < 1) {
      return { valid: false, message: "幅と高さは1px以上で入力してください。" };
    }
    if (normalizedWidth > LIMITS.maxSide || normalizedHeight > LIMITS.maxSide) {
      return { valid: false, message: `幅と高さは${LIMITS.maxSide}px以下で入力してください。` };
    }
    if (normalizedWidth * normalizedHeight > maxPixels) {
      const tenThousandsOfPixels = Math.round(maxPixels / 10_000).toLocaleString("ja-JP");
      return {
        valid: false,
        message: `この端末では出力画像を約${tenThousandsOfPixels}万画素以下にしてください。`
      };
    }
    return { valid: true, message: "" };
  }

  function fitWithinLimits(width, height, maxPixels, maxSide) {
    const pixelScale = Math.sqrt(maxPixels / (width * height));
    const scale = Math.min(1, maxSide / width, maxSide / height, pixelScale);

    return {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale))
    };
  }

  function fitWithinOutputLimits(width, height, maxPixels = LIMITS.maxOutputPixels) {
    return fitWithinLimits(width, height, maxPixels, LIMITS.maxSide);
  }

  function fitWithinPreviewLimits(width, height) {
    return fitWithinLimits(
      width,
      height,
      LIMITS.maxPreviewPixels,
      LIMITS.maxPreviewSide
    );
  }

  function calculateFit(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;

    return {
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      destinationX: (targetWidth - width) / 2,
      destinationY: (targetHeight - height) / 2,
      destinationWidth: width,
      destinationHeight: height
    };
  }

  function calculateCrop(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    focalX = 0.5,
    focalY = 0.5
  ) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
    } else if (sourceRatio < targetRatio) {
      cropHeight = sourceWidth / targetRatio;
    }

    const normalizedFocalX = clamp(Number(focalX) || 0, 0, 1);
    const normalizedFocalY = clamp(Number(focalY) || 0, 0, 1);

    return {
      sourceX: clamp(
        sourceWidth * normalizedFocalX - cropWidth / 2,
        0,
        sourceWidth - cropWidth
      ),
      sourceY: clamp(
        sourceHeight * normalizedFocalY - cropHeight / 2,
        0,
        sourceHeight - cropHeight
      ),
      sourceWidth: cropWidth,
      sourceHeight: cropHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: targetWidth,
      destinationHeight: targetHeight
    };
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return new Uint8Array(0);
  }

  function matches(bytes, offset, expected) {
    return expected.every((value, index) => bytes[offset + index] === value);
  }

  function parsePngDimensions(bytes) {
    if (bytes.length < 24 || !matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  function parseBmpDimensions(bytes) {
    if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: Math.abs(view.getInt32(18, true)),
      height: Math.abs(view.getInt32(22, true))
    };
  }

  function parseJpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
    ]);
    let offset = 2;

    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.length) return null;

      const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if (sofMarkers.has(marker) && segmentLength >= 7) {
        return {
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
          height: (bytes[offset + 3] << 8) | bytes[offset + 4]
        };
      }
      offset += segmentLength;
    }
    return null;
  }

  function parseWebpDimensions(bytes) {
    if (
      bytes.length < 30 ||
      !matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
      !matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    ) {
      return null;
    }
    const chunk = String.fromCharCode(...bytes.slice(12, 16));

    if (chunk === "VP8X" && bytes.length >= 30) {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
      };
    }
    if (
      chunk === "VP8 " &&
      bytes.length >= 30 &&
      matches(bytes, 23, [0x9d, 0x01, 0x2a])
    ) {
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
      };
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits =
        bytes[21] |
        (bytes[22] << 8) |
        (bytes[23] << 16) |
        (bytes[24] << 24);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1
      };
    }
    return null;
  }

  function parseImageDimensions(value) {
    const bytes = toUint8Array(value);
    return (
      parsePngDimensions(bytes) ||
      parseJpegDimensions(bytes) ||
      parseWebpDimensions(bytes) ||
      parseBmpDimensions(bytes)
    );
  }

  function sanitizeFilename(value) {
    const withoutExtension = String(value || "")
      .trim()
      .replace(/\.(jpe?g|png|webp|bmp)$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[.\s-]+$/g, "")
      .trim();

    const safeName = withoutExtension.slice(0, 100);
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safeName)
      ? `${safeName}-image`
      : safeName || "resized-image";
  }

  function getMimeType(format) {
    return MIME_TYPES[format] || MIME_TYPES.jpeg;
  }

  function getExtension(format) {
    return EXTENSIONS[format] || EXTENSIONS.jpeg;
  }

  function getExtensionForMime(mimeType) {
    return MIME_EXTENSIONS[mimeType] || "";
  }

  function normalizeQuality(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0.9;
    return Math.min(1, Math.max(0.4, numericValue / 100));
  }

  function estimateOutputBytes(previewBytes, previewPixels, outputPixels) {
    if (![previewBytes, previewPixels, outputPixels].every(isPositiveNumber)) return 0;
    return Math.max(1, Math.round(previewBytes * outputPixels / previewPixels));
  }

  function getUpscaleFactor(rectangle) {
    if (!rectangle) return 1;
    return Math.max(
      rectangle.destinationWidth / rectangle.sourceWidth,
      rectangle.destinationHeight / rectangle.sourceHeight
    );
  }

  function formatBytes(bytes) {
    const numericBytes = Number(bytes);
    if (!Number.isFinite(numericBytes) || numericBytes < 0) return "—";
    if (numericBytes < 1024) return `${numericBytes} B`;
    if (numericBytes < 1024 * 1024) return `${(numericBytes / 1024).toFixed(1)} KB`;
    return `${(numericBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const api = {
    LIMITS,
    ACCEPTED_INPUT_TYPES,
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
  };

  globalScope.ImageUtils = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
