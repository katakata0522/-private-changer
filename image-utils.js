(function exposeImageUtils(globalScope) {
  "use strict";

  const LIMITS = Object.freeze({
    maxFileBytes: 40 * 1024 * 1024,
    maxSourcePixels: 50_000_000,
    maxOutputPixels: 16_777_216,
    maxSide: 8192
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

  const ACCEPTED_INPUT_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp"
  ]);

  function isPositiveNumber(value) {
    return Number.isFinite(value) && value > 0;
  }

  function isAcceptedInputFile(file) {
    if (!file) return false;
    if (ACCEPTED_INPUT_TYPES.has(file.type)) return true;
    return /\.(jpe?g|png|webp|bmp)$/i.test(file.name || "");
  }

  function validateSource(file, width, height) {
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
    if (width * height > LIMITS.maxSourcePixels) {
      return { valid: false, message: "画像の画素数が大きすぎます。5000万画素以下の画像を選択してください。" };
    }
    return { valid: true, message: "" };
  }

  function validateOutputDimensions(width, height) {
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
    if (normalizedWidth * normalizedHeight > LIMITS.maxOutputPixels) {
      return { valid: false, message: "出力画像は約1677万画素以下にしてください。" };
    }
    return { valid: true, message: "" };
  }

  function fitWithinOutputLimits(width, height) {
    const pixelScale = Math.sqrt(LIMITS.maxOutputPixels / (width * height));
    const scale = Math.min(1, LIMITS.maxSide / width, LIMITS.maxSide / height, pixelScale);

    return {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale))
    };
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

  function calculateCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
    } else if (sourceRatio < targetRatio) {
      cropHeight = sourceWidth / targetRatio;
    }

    return {
      sourceX: (sourceWidth - cropWidth) / 2,
      sourceY: (sourceHeight - cropHeight) / 2,
      sourceWidth: cropWidth,
      sourceHeight: cropHeight,
      destinationX: 0,
      destinationY: 0,
      destinationWidth: targetWidth,
      destinationHeight: targetHeight
    };
  }

  function sanitizeFilename(value) {
    const withoutExtension = String(value || "")
      .trim()
      .replace(/\.(jpe?g|png|webp|bmp)$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[.\s-]+$/g, "")
      .trim();

    return withoutExtension.slice(0, 100) || "resized-image";
  }

  function getMimeType(format) {
    return MIME_TYPES[format] || MIME_TYPES.jpeg;
  }

  function getExtension(format) {
    return EXTENSIONS[format] || EXTENSIONS.jpeg;
  }

  function normalizeQuality(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0.9;
    return Math.min(1, Math.max(0.5, numericValue / 100));
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
  };

  globalScope.ImageUtils = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
