(function initializeImageResizer() {
  "use strict";

  const {
    validateSource,
    validateOutputDimensions,
    fitWithinOutputLimits,
    isAcceptedInputFile,
    calculateFit,
    calculateCrop,
    sanitizeFilename,
    getMimeType,
    getExtension,
    normalizeQuality,
    formatBytes
  } = window.ImageUtils;

  const elements = {
    fileInput: document.getElementById("image-file"),
    dropZone: document.getElementById("drop-zone"),
    uploadError: document.getElementById("upload-error"),
    workspace: document.getElementById("workspace"),
    form: document.getElementById("resize-form"),
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
    format: document.getElementById("output-format"),
    qualityField: document.getElementById("quality-field"),
    quality: document.getElementById("quality"),
    qualityValue: document.getElementById("quality-value"),
    filename: document.getElementById("output-filename"),
    extension: document.getElementById("output-extension"),
    canvas: document.getElementById("preview-canvas"),
    canvasStage: document.getElementById("canvas-stage"),
    renderStatus: document.getElementById("render-status"),
    outputDimensions: document.getElementById("output-dimensions"),
    outputSize: document.getElementById("output-size"),
    renderError: document.getElementById("render-error"),
    downloadButton: document.getElementById("download-button")
  };

  const state = {
    file: null,
    image: null,
    sourceUrl: "",
    previewUrl: "",
    outputBlob: null,
    sourceWidth: 0,
    sourceHeight: 0,
    renderToken: 0,
    renderTimer: null,
    changingDimensions: false
  };

  function showMessage(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function setRenderState(label, tone = "idle") {
    elements.renderStatus.textContent = label;
    elements.renderStatus.dataset.tone = tone;
  }

  function revokeUrl(key) {
    if (state[key]) {
      URL.revokeObjectURL(state[key]);
      state[key] = "";
    }
  }

  function clearOutput() {
    revokeUrl("previewUrl");
    state.outputBlob = null;
    elements.downloadButton.disabled = true;
    elements.outputSize.textContent = "—";
  }

  async function decodeImage(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      if ("createImageBitmap" in window) {
        try {
          const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          return { image: bitmap, objectUrl };
        } catch {
          // Safariなど、オプション付きcreateImageBitmapに未対応の環境ではImageへフォールバックする。
        }
      }

      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
        image.src = objectUrl;
      });
      return { image, objectUrl };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function handleFile(file) {
    showMessage(elements.uploadError, "");

    if (!file) return;
    if (!isAcceptedInputFile(file)) {
      showMessage(elements.uploadError, "JPG、PNG、WebP、BMP形式の画像を選択してください。");
      return;
    }
    if (file.size > window.ImageUtils.LIMITS.maxFileBytes) {
      showMessage(elements.uploadError, "40MB以下の画像を選択してください。");
      return;
    }

    elements.dropZone.classList.add("is-loading");
    elements.dropZone.setAttribute("aria-busy", "true");

    try {
      const decoded = await decodeImage(file);
      const width = decoded.image.naturalWidth || decoded.image.width;
      const height = decoded.image.naturalHeight || decoded.image.height;
      const validation = validateSource(file, width, height);

      if (!validation.valid) {
        decoded.image.close?.();
        URL.revokeObjectURL(decoded.objectUrl);
        showMessage(elements.uploadError, validation.message);
        return;
      }

      resetImageState();
      state.file = file;
      state.image = decoded.image;
      state.sourceUrl = decoded.objectUrl;
      state.sourceWidth = width;
      state.sourceHeight = height;

      elements.sourceThumbnail.src = decoded.objectUrl;
      elements.sourceThumbnail.alt = `${file.name}の縮小プレビュー`;
      elements.sourceName.textContent = file.name;
      elements.sourceDimensions.textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`;
      elements.sourceSize.textContent = formatBytes(file.size);
      const initialDimensions = fitWithinOutputLimits(width, height);
      elements.width.value = initialDimensions.width;
      elements.height.value = initialDimensions.height;
      elements.aspectLock.checked = true;
      elements.filename.value = sanitizeFilename(file.name);
      elements.workspace.hidden = false;
      document.body.classList.add("has-image");
      elements.workspace.scrollIntoView({ behavior: "smooth", block: "start" });

      scheduleRender(0);
    } catch (error) {
      showMessage(elements.uploadError, error.message || "画像を読み込めませんでした。別の画像をお試しください。");
    } finally {
      elements.dropZone.classList.remove("is-loading");
      elements.dropZone.removeAttribute("aria-busy");
      elements.fileInput.value = "";
    }
  }

  function resetImageState() {
    state.renderToken += 1;
    if (state.renderTimer) clearTimeout(state.renderTimer);
    state.image?.close?.();
    revokeUrl("sourceUrl");
    clearOutput();
    state.file = null;
    state.image = null;
    state.sourceWidth = 0;
    state.sourceHeight = 0;
  }

  function resetApplication() {
    resetImageState();
    elements.workspace.hidden = true;
    document.body.classList.remove("has-image");
    elements.sourceThumbnail.removeAttribute("src");
    elements.sourceThumbnail.alt = "";
    elements.form.reset();
    syncDependentControls();
    elements.qualityValue.textContent = "90";
    showMessage(elements.uploadError, "");
    showMessage(elements.dimensionError, "");
    showMessage(elements.renderError, "");
    elements.fileInput.focus();
  }

  function getSelectedValue(name) {
    return elements.form.querySelector(`input[name="${name}"]:checked`)?.value;
  }

  function syncDependentControls() {
    const isCrop = getSelectedValue("resize-mode") === "crop";
    const isPng = elements.format.value === "png";
    const wantsTransparency = getSelectedValue("background") === "transparent";

    elements.backgroundFieldset.disabled = isCrop;
    elements.backgroundFieldset.classList.toggle("is-disabled", isCrop);
    elements.quality.disabled = isPng;
    elements.qualityField.classList.toggle("is-disabled", isPng);
    elements.qualityValue.textContent = isPng ? "—" : elements.quality.value;
    elements.backgroundNote.hidden = !(elements.format.value === "jpeg" && wantsTransparency && !isCrop);
    elements.extension.textContent = getExtension(elements.format.value);
  }

  function syncAspectRatio(changedInput) {
    if (!elements.aspectLock.checked || state.changingDimensions || !state.sourceWidth || !state.sourceHeight) return;

    const value = Number(changedInput.value);
    if (!Number.isFinite(value) || value < 1) return;

    state.changingDimensions = true;
    if (changedInput === elements.width) {
      elements.height.value = Math.max(1, Math.round(value * state.sourceHeight / state.sourceWidth));
    } else {
      elements.width.value = Math.max(1, Math.round(value * state.sourceWidth / state.sourceHeight));
    }
    state.changingDimensions = false;
  }

  function scheduleRender(delay = 180) {
    if (!state.image) return;
    if (state.renderTimer) clearTimeout(state.renderTimer);
    setRenderState("更新待ち", "idle");
    clearOutput();
    state.renderTimer = setTimeout(renderOutput, delay);
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("この形式で画像を作成できませんでした。")),
        type,
        quality
      );
    });
  }

  async function renderOutput() {
    const token = ++state.renderToken;
    const width = Number(elements.width.value);
    const height = Number(elements.height.value);
    const validation = validateOutputDimensions(width, height);

    showMessage(elements.dimensionError, validation.message);
    showMessage(elements.renderError, "");

    if (!validation.valid) {
      setRenderState("設定を確認", "error");
      elements.outputDimensions.textContent = "—";
      clearOutput();
      return;
    }

    try {
      setRenderState("生成中", "working");
      elements.outputSize.textContent = "計算中";
      elements.canvas.width = width;
      elements.canvas.height = height;

      const context = elements.canvas.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, width, height);

      const mode = getSelectedValue("resize-mode");
      const background = getSelectedValue("background");
      const format = elements.format.value;
      const shouldFillWhite = mode === "fit" && (background === "white" || format === "jpeg");

      if (shouldFillWhite) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }

      const rectangle = mode === "crop"
        ? calculateCrop(state.sourceWidth, state.sourceHeight, width, height)
        : calculateFit(state.sourceWidth, state.sourceHeight, width, height);

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

      const blob = await canvasToBlob(
        elements.canvas,
        getMimeType(format),
        normalizeQuality(elements.quality.value)
      );

      if (token !== state.renderToken) return;

      clearOutput();
      state.outputBlob = blob;
      state.previewUrl = URL.createObjectURL(blob);
      elements.outputDimensions.textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`;
      elements.outputSize.textContent = formatBytes(blob.size);
      elements.downloadButton.disabled = false;
      setRenderState("保存できます", "ready");
    } catch (error) {
      if (token !== state.renderToken) return;
      clearOutput();
      setRenderState("生成失敗", "error");
      showMessage(elements.renderError, error.message || "画像の生成に失敗しました。設定を変えてお試しください。");
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
    scheduleRender(0);
  }

  function downloadOutput() {
    if (!state.outputBlob || !state.previewUrl) return;

    const link = document.createElement("a");
    const name = sanitizeFilename(elements.filename.value);
    elements.filename.value = name;
    link.href = state.previewUrl;
    link.download = `${name}${getExtension(elements.format.value)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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

  [elements.width, elements.height].forEach(input => {
    input.addEventListener("input", () => {
      syncAspectRatio(input);
      document.querySelectorAll(".preset-button").forEach(button => {
        button.classList.remove("is-selected");
        button.setAttribute("aria-pressed", "false");
      });
      scheduleRender();
    });
  });

  elements.form.addEventListener("change", event => {
    if (event.target === elements.width || event.target === elements.height) return;
    syncDependentControls();
    scheduleRender();
  });

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    scheduleRender(0);
  });

  elements.quality.addEventListener("input", () => {
    elements.qualityValue.textContent = elements.quality.value;
    scheduleRender();
  });

  document.querySelectorAll(".preset-button").forEach(button => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyPreset(button));
  });

  elements.resetButton.addEventListener("click", resetApplication);
  elements.downloadButton.addEventListener("click", downloadOutput);
  elements.filename.addEventListener("blur", () => {
    elements.filename.value = sanitizeFilename(elements.filename.value);
  });
  window.addEventListener("beforeunload", resetImageState);

  syncDependentControls();
})();
