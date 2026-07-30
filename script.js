(function initializeImageResizer() {
  "use strict";

  const {
    LIMITS,
    validateSource,
    validateOutputDimensions,
    fitWithinOutputLimits,
    fitWithinPreviewLimits,
    isAcceptedInputFile,
    getSourcePixelLimit,
    getOutputPixelLimit,
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
  } = window.ImageUtils;

  const elements = {
    fileInput: document.getElementById("image-file"),
    dropZone: document.getElementById("drop-zone"),
    uploadError: document.getElementById("upload-error"),
    workspace: document.getElementById("workspace"),
    settings: document.getElementById("resize-form"),
    resetButton: document.getElementById("reset-button"),
    sourceThumbnail: document.getElementById("source-thumbnail"),
    sourceName: document.getElementById("source-name"),
    sourceDimensions: document.getElementById("source-dimensions"),
    sourceSize: document.getElementById("source-size"),
    width: document.getElementById("output-width"),
    height: document.getElementById("output-height"),
    aspectLock: document.getElementById("aspect-lock"),
    dimensionError: document.getElementById("dimension-error"),
    backgroundFieldset: document.getElementById("background-fieldset"),
    backgroundNote: document.getElementById("background-note"),
    cropPositionField: document.getElementById("crop-position-field"),
    cropX: document.getElementById("crop-x"),
    cropY: document.getElementById("crop-y"),
    cropXValue: document.getElementById("crop-x-value"),
    cropYValue: document.getElementById("crop-y-value"),
    cropDragHint: document.getElementById("crop-drag-hint"),
    format: document.getElementById("output-format"),
    qualityField: document.getElementById("quality-field"),
    quality: document.getElementById("quality"),
    qualityValue: document.getElementById("quality-value"),
    targetSizeEnabled: document.getElementById("target-size-enabled"),
    targetSizeControl: document.getElementById("target-size-control"),
    targetSize: document.getElementById("target-size"),
    targetSizeNote: document.getElementById("target-size-note"),
    filename: document.getElementById("output-filename"),
    extension: document.getElementById("output-extension"),
    canvas: document.getElementById("preview-canvas"),
    canvasStage: document.getElementById("canvas-stage"),
    previewTitle: document.getElementById("preview-title"),
    renderStatus: document.getElementById("render-status"),
    outputDimensions: document.getElementById("output-dimensions"),
    outputSize: document.getElementById("output-size"),
    upscaleWarning: document.getElementById("upscale-warning"),
    renderError: document.getElementById("render-error"),
    downloadButton: document.getElementById("download-button"),
    mobileDownloadButton: document.getElementById("mobile-download-button"),
    mobileOutputSummary: document.getElementById("mobile-output-summary")
  };

  const state = {
    file: null,
    image: null,
    sourceWidth: 0,
    sourceHeight: 0,
    loadToken: 0,
    renderToken: 0,
    settingsRevision: 0,
    renderTimer: null,
    changingDimensions: false,
    isExporting: false,
    drag: null
  };

  function showMessage(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function setRenderState(label, tone = "idle") {
    elements.renderStatus.textContent = label;
    elements.renderStatus.dataset.tone = tone;
  }

  function setDownloadState(enabled, label = "この設定で画像を生成") {
    const disabled = !enabled || state.isExporting;
    elements.downloadButton.disabled = disabled;
    elements.mobileDownloadButton.disabled = disabled;
    elements.downloadButton.textContent = label;
    elements.mobileDownloadButton.textContent = state.isExporting ? "生成中…" : "画像を生成";
  }

  function closeImage(image) {
    image?.close?.();
  }

  function clearImageState() {
    state.loadToken += 1;
    state.renderToken += 1;
    state.settingsRevision += 1;
    if (state.renderTimer) clearTimeout(state.renderTimer);
    closeImage(state.image);
    state.file = null;
    state.image = null;
    state.sourceWidth = 0;
    state.sourceHeight = 0;
    state.drag = null;
    elements.canvas.width = 1;
    elements.canvas.height = 1;
    setDownloadState(false);
  }

  function resetControls() {
    elements.width.value = "";
    elements.height.value = "";
    elements.aspectLock.checked = true;
    elements.settings.querySelector('input[name="resize-mode"][value="fit"]').checked = true;
    elements.settings.querySelector('input[name="background"][value="white"]').checked = true;
    elements.cropX.value = "50";
    elements.cropY.value = "50";
    elements.format.value = "jpeg";
    elements.quality.value = "90";
    elements.targetSizeEnabled.checked = false;
    elements.targetSize.value = "500";
    elements.filename.value = "";
    document.querySelectorAll(".preset-button").forEach(button => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
    });
    syncDependentControls();
  }

  function resetApplication() {
    clearImageState();
    resetControls();
    elements.workspace.hidden = true;
    document.body.classList.remove("has-image", "is-exporting");
    elements.sourceThumbnail.removeAttribute("src");
    elements.sourceThumbnail.alt = "";
    elements.fileInput.disabled = false;
    showMessage(elements.uploadError, "");
    showMessage(elements.dimensionError, "");
    showMessage(elements.renderError, "");
    showMessage(elements.upscaleWarning, "");
    setRenderState("準備中");
    elements.outputDimensions.textContent = "—";
    elements.outputSize.textContent = "—";
    elements.mobileOutputSummary.textContent = "設定を確認中";
    elements.fileInput.focus();
  }

  function getSelectedValue(name) {
    return elements.settings.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function getEffectiveDeviceMemory() {
    if (Number.isFinite(Number(navigator.deviceMemory))) return Number(navigator.deviceMemory);
    return matchMedia("(pointer: coarse)").matches ? 4 : 8;
  }

  function getCurrentOutputPixelLimit() {
    return getOutputPixelLimit(getEffectiveDeviceMemory());
  }

  function getSettings() {
    const targetSizeEnabled =
      elements.targetSizeEnabled.checked && elements.format.value !== "png";
    return {
      width: Number(elements.width.value),
      height: Number(elements.height.value),
      mode: getSelectedValue("resize-mode"),
      background: getSelectedValue("background"),
      format: elements.format.value,
      quality: normalizeQuality(elements.quality.value),
      focalX: Number(elements.cropX.value) / 100,
      focalY: Number(elements.cropY.value) / 100,
      targetSizeEnabled,
      targetBytes: targetSizeEnabled ? Number(elements.targetSize.value) * 1024 : 0
    };
  }

  function formatPosition(value, low, middle, high) {
    const numeric = Number(value);
    if (numeric < 34) return low;
    if (numeric > 66) return high;
    return middle;
  }

  function syncDependentControls() {
    const isCrop = getSelectedValue("resize-mode") === "crop";
    const isPng = elements.format.value === "png";
    const wantsTransparency = getSelectedValue("background") === "transparent";
    const usesTargetSize = elements.targetSizeEnabled.checked && !isPng;

    elements.backgroundFieldset.disabled = isCrop;
    elements.backgroundFieldset.classList.toggle("is-disabled", isCrop);
    elements.cropPositionField.hidden = !isCrop;
    elements.cropDragHint.hidden = !isCrop;
    elements.canvasStage.classList.toggle("is-cropping", isCrop);
    elements.quality.disabled = isPng;
    elements.qualityField.classList.toggle("is-disabled", isPng);
    elements.qualityValue.textContent = isPng ? "—" : elements.quality.value;
    elements.targetSizeEnabled.disabled = isPng;
    elements.targetSizeControl.hidden = !usesTargetSize;
    elements.targetSizeNote.hidden = !usesTargetSize;
    elements.backgroundNote.hidden = !(
      elements.format.value === "jpeg" &&
      wantsTransparency &&
      !isCrop
    );
    elements.extension.textContent = getExtension(elements.format.value);
    elements.cropXValue.textContent = formatPosition(elements.cropX.value, "左寄り", "中央", "右寄り");
    elements.cropYValue.textContent = formatPosition(elements.cropY.value, "上寄り", "中央", "下寄り");
  }

  async function readHeaderDimensions(file) {
    let bytesToRead = Math.min(file.size, LIMITS.maxHeaderBytes);
    while (bytesToRead > 0) {
      const header = await file.slice(0, bytesToRead).arrayBuffer();
      const dimensions = parseImageDimensions(header);
      if (dimensions || bytesToRead >= file.size) return dimensions;
      bytesToRead = Math.min(file.size, bytesToRead * 2);
    }
    return null;
  }

  async function decodeImage(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        // オプション付きcreateImageBitmapに未対応の環境ではImageへフォールバックする。
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
        image.src = objectUrl;
      });
      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function createThumbnail(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 160;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return "";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const rectangle = calculateFit(sourceWidth, sourceHeight, canvas.width, canvas.height);
    context.drawImage(
      image,
      rectangle.sourceX,
      rectangle.sourceY,
      rectangle.sourceWidth,
      rectangle.sourceHeight,
      rectangle.destinationX,
      rectangle.destinationY,
      rectangle.destinationWidth,
      rectangle.destinationHeight
    );
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  async function handleFile(file) {
    const loadToken = ++state.loadToken;
    showMessage(elements.uploadError, "");

    if (!file) return;
    if (!isAcceptedInputFile(file)) {
      showMessage(elements.uploadError, "JPG、PNG、WebP、BMP形式の画像を選択してください。");
      return;
    }
    if (file.size > LIMITS.maxFileBytes) {
      showMessage(elements.uploadError, "40MB以下の画像を選択してください。");
      return;
    }

    elements.dropZone.classList.add("is-loading");
    elements.dropZone.setAttribute("aria-busy", "true");

    let decodedImage = null;
    try {
      const headerDimensions = await readHeaderDimensions(file);
      if (loadToken !== state.loadToken) return;

      if (headerDimensions) {
        const headerValidation = validateSource(
          file,
          headerDimensions.width,
          headerDimensions.height,
          getSourcePixelLimit(getEffectiveDeviceMemory())
        );
        if (!headerValidation.valid) {
          showMessage(elements.uploadError, headerValidation.message);
          return;
        }
      }

      decodedImage = await decodeImage(file);
      if (loadToken !== state.loadToken) {
        closeImage(decodedImage);
        return;
      }

      const width = decodedImage.naturalWidth || decodedImage.width;
      const height = decodedImage.naturalHeight || decodedImage.height;
      const validation = validateSource(
        file,
        width,
        height,
        getSourcePixelLimit(getEffectiveDeviceMemory())
      );
      if (!validation.valid) {
        closeImage(decodedImage);
        showMessage(elements.uploadError, validation.message);
        return;
      }

      if (state.renderTimer) clearTimeout(state.renderTimer);
      closeImage(state.image);
      state.renderToken += 1;
      state.settingsRevision += 1;
      state.file = file;
      state.image = decodedImage;
      state.sourceWidth = width;
      state.sourceHeight = height;
      decodedImage = null;

      elements.sourceThumbnail.src = createThumbnail(state.image);
      elements.sourceThumbnail.alt = `${file.name}の縮小プレビュー`;
      elements.sourceName.textContent = file.name;
      elements.sourceDimensions.textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`;
      elements.sourceSize.textContent = formatBytes(file.size);
      const initialDimensions = fitWithinOutputLimits(
        width,
        height,
        getCurrentOutputPixelLimit()
      );
      elements.width.value = initialDimensions.width;
      elements.height.value = initialDimensions.height;
      elements.aspectLock.checked = true;
      elements.filename.value = sanitizeFilename(file.name);
      elements.workspace.hidden = false;
      document.body.classList.add("has-image");
      elements.previewTitle.focus({ preventScroll: true });
      elements.workspace.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });

      schedulePreview(0);
    } catch (error) {
      if (loadToken === state.loadToken) {
        showMessage(
          elements.uploadError,
          error.message || "画像を読み込めませんでした。別の画像をお試しください。"
        );
      }
    } finally {
      closeImage(decodedImage);
      if (loadToken === state.loadToken) {
        elements.dropZone.classList.remove("is-loading");
        elements.dropZone.removeAttribute("aria-busy");
        elements.fileInput.value = "";
      }
    }
  }

  function syncAspectRatio(changedInput) {
    if (
      !elements.aspectLock.checked ||
      state.changingDimensions ||
      !state.sourceWidth ||
      !state.sourceHeight
    ) {
      return;
    }

    const value = Number(changedInput.value);
    if (!Number.isFinite(value) || value < 1) return;

    state.changingDimensions = true;
    if (changedInput === elements.width) {
      elements.height.value = Math.max(
        1,
        Math.round(value * state.sourceHeight / state.sourceWidth)
      );
    } else {
      elements.width.value = Math.max(
        1,
        Math.round(value * state.sourceWidth / state.sourceHeight)
      );
    }
    state.changingDimensions = false;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error("この形式で画像を作成できませんでした。"));
          return;
        }
        if (blob.type !== type) {
          reject(new Error(
            `${type.replace("image/", "").toUpperCase()}形式はこのブラウザで保存できません。別の形式を選んでください。`
          ));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function drawOutput(canvas, settings) {
    canvas.width = settings.width;
    canvas.height = settings.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("画像処理を開始できませんでした。ブラウザを再起動してください。");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    const shouldFillWhite =
      settings.mode === "fit" &&
      (settings.background === "white" || settings.format === "jpeg");
    if (shouldFillWhite) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    const rectangle = settings.mode === "crop"
      ? calculateCrop(
          state.sourceWidth,
          state.sourceHeight,
          canvas.width,
          canvas.height,
          settings.focalX,
          settings.focalY
        )
      : calculateFit(state.sourceWidth, state.sourceHeight, canvas.width, canvas.height);

    context.drawImage(
      state.image,
      rectangle.sourceX,
      rectangle.sourceY,
      rectangle.sourceWidth,
      rectangle.sourceHeight,
      rectangle.destinationX,
      rectangle.destinationY,
      rectangle.destinationWidth,
      rectangle.destinationHeight
    );
    return rectangle;
  }

  function schedulePreview(delay = 140) {
    if (!state.image) return;
    state.settingsRevision += 1;
    if (state.isExporting) return;
    const token = ++state.renderToken;
    if (state.renderTimer) clearTimeout(state.renderTimer);
    setRenderState("更新待ち", "idle");
    setDownloadState(false);
    state.renderTimer = setTimeout(() => renderPreview(token), delay);
  }

  async function renderPreview(token) {
    const settings = getSettings();
    const validation = validateOutputDimensions(
      settings.width,
      settings.height,
      getCurrentOutputPixelLimit()
    );
    showMessage(elements.dimensionError, validation.message);
    showMessage(elements.renderError, "");

    if (!validation.valid) {
      setRenderState("設定を確認", "error");
      elements.outputDimensions.textContent = "—";
      elements.outputSize.textContent = "—";
      elements.mobileOutputSummary.textContent = "サイズを確認してください";
      showMessage(elements.upscaleWarning, "");
      return;
    }

    try {
      setRenderState("プレビュー生成中", "working");
      const previewDimensions = fitWithinPreviewLimits(settings.width, settings.height);
      const previewSettings = {
        ...settings,
        width: previewDimensions.width,
        height: previewDimensions.height
      };
      drawOutput(elements.canvas, previewSettings);
      const previewBlob = await canvasToBlob(
        elements.canvas,
        getMimeType(settings.format),
        settings.quality
      );
      if (token !== state.renderToken) return;

      const outputPixels = settings.width * settings.height;
      const previewPixels = previewDimensions.width * previewDimensions.height;
      const estimatedBytes = estimateOutputBytes(
        previewBlob.size,
        previewPixels,
        outputPixels
      );
      const outputRectangle = settings.mode === "crop"
        ? calculateCrop(
            state.sourceWidth,
            state.sourceHeight,
            settings.width,
            settings.height,
            settings.focalX,
            settings.focalY
          )
        : calculateFit(
            state.sourceWidth,
            state.sourceHeight,
            settings.width,
            settings.height
          );
      const upscaleFactor = getUpscaleFactor(outputRectangle);

      elements.outputDimensions.textContent =
        `${settings.width.toLocaleString()} × ${settings.height.toLocaleString()} px`;
      elements.outputSize.textContent = `約 ${formatBytes(estimatedBytes)}`;
      elements.mobileOutputSummary.textContent =
        `${settings.width.toLocaleString()} × ${settings.height.toLocaleString()} px`;
      showMessage(
        elements.upscaleWarning,
        upscaleFactor > 1.05
          ? `元画像を約${upscaleFactor.toFixed(1)}倍に拡大します。寸法は増えても細部は鮮明になりません。`
          : ""
      );
      setDownloadState(true);
      setRenderState("保存できます", "ready");
    } catch (error) {
      if (token !== state.renderToken) return;
      setDownloadState(false);
      setRenderState("プレビュー失敗", "error");
      showMessage(
        elements.renderError,
        error.message || "プレビューの生成に失敗しました。設定を変えてお試しください。"
      );
    }
  }

  async function encodeWithinTarget(canvas, mimeType, maximumQuality, targetBytes) {
    const firstBlob = await canvasToBlob(canvas, mimeType, maximumQuality);
    if (!targetBytes || firstBlob.size <= targetBytes) return firstBlob;

    let minimum = 0.4;
    let maximum = maximumQuality;
    let bestBlob = null;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const quality = (minimum + maximum) / 2;
      const blob = await canvasToBlob(canvas, mimeType, quality);
      if (blob.size <= targetBytes) {
        bestBlob = blob;
        minimum = quality;
      } else {
        maximum = quality;
      }
    }

    if (!bestBlob) {
      throw new Error(
        `指定した${formatBytes(targetBytes)}に収まりません。出力サイズを小さくするか、容量上限を増やしてください。`
      );
    }
    return bestBlob;
  }

  async function downloadOutput() {
    if (!state.image || state.isExporting) return;
    const settings = getSettings();
    const validation = validateOutputDimensions(
      settings.width,
      settings.height,
      getCurrentOutputPixelLimit()
    );
    if (!validation.valid) {
      showMessage(elements.dimensionError, validation.message);
      return;
    }
    if (
      settings.targetSizeEnabled &&
      (!Number.isFinite(settings.targetBytes) ||
        settings.targetBytes < 10 * 1024 ||
        settings.targetBytes > 20_000 * 1024)
    ) {
      showMessage(elements.renderError, "容量上限は10KBから20,000KBの間で入力してください。");
      elements.targetSize.focus();
      return;
    }

    const revision = state.settingsRevision;
    state.isExporting = true;
    document.body.classList.add("is-exporting");
    elements.settings.inert = true;
    setDownloadState(false, "高解像度画像を生成中…");
    setRenderState("保存画像を生成中", "working");
    showMessage(elements.renderError, "");

    try {
      const exportCanvas = document.createElement("canvas");
      drawOutput(exportCanvas, settings);
      const mimeType = getMimeType(settings.format);
      const blob = settings.targetBytes
        ? await encodeWithinTarget(
            exportCanvas,
            mimeType,
            settings.quality,
            settings.targetBytes
          )
        : await canvasToBlob(exportCanvas, mimeType, settings.quality);

      exportCanvas.width = 1;
      exportCanvas.height = 1;
      if (revision !== state.settingsRevision) {
        throw new Error("生成中に設定が変更されました。新しい設定でもう一度保存してください。");
      }

      const extension = getExtensionForMime(blob.type);
      if (!extension) throw new Error("生成した画像の形式を確認できませんでした。");
      const name = sanitizeFilename(elements.filename.value);
      elements.filename.value = name;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      elements.outputSize.textContent = `${formatBytes(blob.size)}（実測）`;
      setRenderState("保存しました", "ready");
    } catch (error) {
      setRenderState("生成失敗", "error");
      showMessage(
        elements.renderError,
        error.message || "画像の生成に失敗しました。設定を変えてお試しください。"
      );
    } finally {
      state.isExporting = false;
      document.body.classList.remove("is-exporting");
      elements.settings.inert = false;
      setDownloadState(
        elements.renderStatus.dataset.tone !== "error",
        "この設定で画像を生成"
      );
    }
  }

  function applyPreset(button) {
    elements.aspectLock.checked = false;
    elements.width.value = button.dataset.width;
    elements.height.value = button.dataset.height;
    document.querySelectorAll(".preset-button").forEach(item => {
      item.classList.toggle("is-selected", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    schedulePreview(0);
  }

  function detectOutputFormats() {
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 1;
    testCanvas.height = 1;
    for (const option of elements.format.options) {
      const mimeType = getMimeType(option.value);
      const isSupported = testCanvas.toDataURL(mimeType).startsWith(`data:${mimeType}`);
      option.disabled = !isSupported;
      if (!isSupported) option.textContent += "（このブラウザでは保存不可）";
    }
    if (elements.format.selectedOptions[0]?.disabled) elements.format.value = "jpeg";
  }

  elements.fileInput.addEventListener("change", event => {
    handleFile(event.target.files?.[0]);
  });

  ["dragenter", "dragover"].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      elements.dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    elements.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  });

  elements.dropZone.addEventListener("drop", event => {
    handleFile(event.dataTransfer?.files?.[0]);
  });

  window.addEventListener("paste", event => {
    const imageFile = [...(event.clipboardData?.files || [])].find(file =>
      file.type.startsWith("image/")
    );
    if (imageFile && !state.isExporting) {
      event.preventDefault();
      handleFile(imageFile);
    }
  });

  [elements.width, elements.height].forEach(input => {
    input.addEventListener("input", () => {
      syncAspectRatio(input);
      document.querySelectorAll(".preset-button").forEach(button => {
        button.classList.remove("is-selected");
        button.setAttribute("aria-pressed", "false");
      });
      schedulePreview();
    });
  });

  elements.settings.addEventListener("change", event => {
    if (event.target === elements.width || event.target === elements.height) return;
    syncDependentControls();
    if ([
      elements.aspectLock,
      elements.quality,
      elements.cropX,
      elements.cropY,
      elements.targetSizeEnabled,
      elements.targetSize,
      elements.filename
    ].includes(event.target)) {
      return;
    }
    schedulePreview();
  });

  [elements.quality, elements.cropX, elements.cropY].forEach(input => {
    input.addEventListener("input", () => {
      syncDependentControls();
      schedulePreview();
    });
  });

  elements.canvasStage.addEventListener("pointerdown", event => {
    if (getSelectedValue("resize-mode") !== "crop" || state.isExporting) return;
    state.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      focalX: Number(elements.cropX.value),
      focalY: Number(elements.cropY.value)
    };
    elements.canvasStage.setPointerCapture(event.pointerId);
    elements.canvasStage.classList.add("is-dragging-crop");
  });

  elements.canvasStage.addEventListener("pointermove", event => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const bounds = elements.canvas.getBoundingClientRect();
    const nextX = state.drag.focalX - (event.clientX - state.drag.x) / bounds.width * 100;
    const nextY = state.drag.focalY - (event.clientY - state.drag.y) / bounds.height * 100;
    elements.cropX.value = String(Math.round(Math.min(100, Math.max(0, nextX))));
    elements.cropY.value = String(Math.round(Math.min(100, Math.max(0, nextY))));
    syncDependentControls();
    schedulePreview(45);
  });

  function stopCropDrag(event) {
    if (state.drag?.pointerId === event.pointerId) {
      state.drag = null;
      elements.canvasStage.classList.remove("is-dragging-crop");
    }
  }

  elements.canvasStage.addEventListener("pointerup", stopCropDrag);
  elements.canvasStage.addEventListener("pointercancel", stopCropDrag);

  document.querySelectorAll(".preset-button").forEach(button => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyPreset(button));
  });

  elements.resetButton.addEventListener("click", resetApplication);
  elements.downloadButton.addEventListener("click", downloadOutput);
  elements.mobileDownloadButton.addEventListener("click", downloadOutput);
  elements.filename.addEventListener("blur", () => {
    elements.filename.value = sanitizeFilename(elements.filename.value);
  });
  window.addEventListener("beforeunload", clearImageState);

  detectOutputFormats();
  resetControls();
  setDownloadState(false);
})();
