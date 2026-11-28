const { test, expect } = require("@playwright/test");

function createSvgDataUrl(width = 640, height = 360) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#176f9f"/>
      <circle cx="${width * 0.7}" cy="${height * 0.45}" r="${height * 0.23}" fill="#f2a900"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function makePng(page) {
  return page.evaluate(async dataUrl => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, createSvgDataUrl());
}

async function uploadPng(page, name = "sample.png") {
  const bytes = await makePng(page);
  await page.locator("#image-file").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  });
  await expect(page.locator("#render-status")).toHaveAttribute("data-tone", "ready");
  return bytes;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows a focused private upload experience", async ({ page }) => {
  await expect(page).toHaveTitle("画像リサイズツール");
  await expect(page.getByRole("heading", { name: "まず、画像を選ぶ" })).toBeVisible();
  await expect(page.getByText("画像は外部へ送信されません").first()).toBeVisible();
  await expect(page.getByText("画像をここにドロップ")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
});

test("loads, resizes, changes format and prepares a download", async ({ page }) => {
  await uploadPng(page, "sample image.png");

  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#source-dimensions")).toHaveText("640 × 360 px");
  await expect(page.locator("#output-dimensions")).toHaveText("640 × 360 px");
  await expect(page.locator("#download-button")).toBeEnabled();

  await page.getByRole("button", { name: /正方形/ }).click();
  await expect(page.locator("#output-width")).toHaveValue("1080");
  await expect(page.locator("#output-height")).toHaveValue("1080");
  await expect(page.locator("#output-dimensions")).toHaveText("1,080 × 1,080 px");

  await page.locator("#output-format").selectOption("png");
  await expect(page.locator("#quality")).toBeDisabled();
  await expect(page.locator("#output-extension")).toHaveText(".png");
  await expect(page.locator("#download-button")).toBeEnabled();
});

test("keeps the source aspect ratio while editing dimensions", async ({ page }) => {
  await uploadPng(page, "ratio.png");

  await page.locator("#output-width").fill("320");
  await expect(page.locator("#output-height")).toHaveValue("180");
  await expect(page.locator("#output-dimensions")).toHaveText("320 × 180 px");
});

test("resets format-dependent controls before loading another image", async ({ page }) => {
  const bytes = await makePng(page);
  const file = {
    name: "reset.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  };
  await page.locator("#image-file").setInputFiles(file);
  await page.locator("#output-format").selectOption("png");
  await expect(page.locator("#quality")).toBeDisabled();

  await page.locator("#reset-button").click();
  await expect(page.locator("#workspace")).toBeHidden();
  await page.locator("#image-file").setInputFiles(file);

  await expect(page.locator("#output-format")).toHaveValue("jpeg");
  await expect(page.locator("#quality")).toBeEnabled();
  await expect(page.locator("#output-extension")).toHaveText(".jpg");
});

test("rejects unsupported files without opening the editor", async ({ page }) => {
  await page.locator("#image-file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image")
  });

  await expect(page.locator("#upload-error")).toContainText("JPG、PNG、WebP、BMP");
  await expect(page.locator("#workspace")).toBeHidden();
});

test("rejects oversized dimensions from the file header before decoding", async ({ page }) => {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(10_000, 16);
  bytes.writeUInt32BE(6_000, 20);
  await page.locator("#image-file").setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: bytes
  });

  await expect(page.locator("#upload-error")).toContainText(/画素以下/);
  await expect(page.locator("#workspace")).toBeHidden();
});

test("reports unsafe output dimensions and recovers", async ({ page }) => {
  await uploadPng(page, "large.png");

  await page.locator("#aspect-lock").uncheck();
  await page.locator("#output-width").fill("5000");
  await page.locator("#output-height").fill("5000");
  await expect(page.locator("#dimension-error")).toContainText("約1,678万画素以下");
  await expect(page.locator("#download-button")).toBeDisabled();

  await page.locator("#output-width").fill("1200");
  await page.locator("#output-height").fill("630");
  await expect(page.locator("#dimension-error")).toBeHidden();
  await expect(page.locator("#download-button")).toBeEnabled();
});

test("does not make network requests outside the local origin", async ({ page }) => {
  const externalRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== "http://127.0.0.1:4173"
    ) {
      externalRequests.push(request.url());
    }
  });
  await page.reload();
  await uploadPng(page, "private.png");
  await page.getByRole("button", { name: /正方形/ }).click();
  await expect(page.locator("#render-status")).toHaveAttribute("data-tone", "ready");
  expect(externalRequests).toEqual([]);
});

test("keeps preview rendering under the preview pixel budget", async ({ page }) => {
  await uploadPng(page, "performance.png");
  await page.locator("#aspect-lock").uncheck();
  await page.locator("#output-width").fill("4096");
  await page.locator("#output-height").fill("4096");
  await expect(page.locator("#output-dimensions")).toHaveText("4,096 × 4,096 px");

  const canvas = await page.locator("#preview-canvas").evaluate(element => ({
    width: element.width,
    height: element.height,
    pixels: element.width * element.height
  }));
  expect(canvas.pixels).toBeLessThanOrEqual(1_500_000);
  expect(canvas.width).toBeLessThanOrEqual(1600);
  expect(canvas.height).toBeLessThanOrEqual(1600);
});

test("downloads bytes whose signature and extension match the selected format", async ({ page }) => {
  await uploadPng(page, "signature.png");
  await page.locator("#output-format").selectOption("png");
  await expect(page.locator("#render-status")).toHaveAttribute("data-tone", "ready");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("signature.png");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.readUInt32BE(16)).toBe(640);
  expect(bytes.readUInt32BE(20)).toBe(360);
});

test("keeps a lossy download under the requested file-size ceiling", async ({ page }) => {
  await uploadPng(page, "target-size.png");
  await page.getByRole("button", { name: /正方形/ }).click();
  await page.locator("#target-size-enabled").check();
  await page.locator("#target-size").fill("100");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-button").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).length).toBeLessThanOrEqual(100 * 1024);
});

test("rejects a browser format fallback instead of giving PNG bytes a WebP extension", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The fallback is simulated in Chromium");
  await page.evaluate(() => {
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function forcePng(callback, type, quality) {
      nativeToBlob.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
    };
  });
  await uploadPng(page, "fallback.png");
  await page.locator("#output-format").selectOption("webp");

  await expect(page.locator("#render-status")).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#render-error")).toContainText("WEBP形式");
  await expect(page.locator("#download-button")).toBeDisabled();
});

test("the most recently selected image wins when decodes finish out of order", async ({ page }) => {
  const bytes = await makePng(page);
  await page.evaluate(() => {
    const nativeCreateImageBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (file, options) => {
      const bitmap = await nativeCreateImageBitmap(file, options);
      await new Promise(resolve => {
        setTimeout(resolve, file.name === "first-slow.png" ? 500 : 10);
      });
      return bitmap;
    };
  });
  await page.evaluate(encodedBytes => {
    const bytes = Uint8Array.from(encodedBytes);
    const input = document.querySelector("#image-file");
    function choose(name) {
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: "image/png" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    choose("first-slow.png");
    choose("second-fast.png");
  }, bytes);

  await expect(page.locator("#source-name")).toHaveText("second-fast.png");
  await page.waitForTimeout(650);
  await expect(page.locator("#source-name")).toHaveText("second-fast.png");
});

test("focus and mobile reading order start with the visible preview", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await uploadPng(page, "mobile.png");

  await expect(page.locator("#preview-title")).toBeFocused();
  const positions = await page.evaluate(() => ({
    preview: document.querySelector(".preview-panel").getBoundingClientRect().top + scrollY,
    settings: document.querySelector(".settings-panel").getBoundingClientRect().top + scrollY,
    canvas: document.querySelector("#canvas-stage").getBoundingClientRect().top + scrollY
  }));
  expect(positions.preview).toBeLessThan(positions.settings);
  expect(positions.canvas).toBeLessThan(900);

  await page.keyboard.press("Tab");
  const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(focusedText).not.toContain("現在の設定を反映");
});

test("crop position controls move the crop focus", async ({ page }) => {
  await uploadPng(page, "crop.png");
  await page.locator('input[name="resize-mode"][value="crop"]').check();
  await expect(page.locator("#crop-position-field")).toBeVisible();
  await page.locator("#crop-x").fill("10");
  await expect(page.locator("#crop-x-value")).toHaveText("左寄り");
  await expect(page.locator("#render-status")).toHaveAttribute("data-tone", "ready");
});

test("dark-mode status text meets normal-text contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await uploadPng(page, "contrast.png");

  function channel(value) {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  }
  function luminance(rgb) {
    const values = rgb.match(/\d+/g).slice(0, 3).map(Number);
    return 0.2126 * channel(values[0]) +
      0.7152 * channel(values[1]) +
      0.0722 * channel(values[2]);
  }
  function contrast(foreground, background) {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }

  const readyColors = await page.locator("#render-status").evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(contrast(readyColors.color, readyColors.background)).toBeGreaterThanOrEqual(4.5);

  await page.locator("#aspect-lock").uncheck();
  await page.locator("#output-width").fill("5000");
  await page.locator("#output-height").fill("5000");
  const errorColors = await page.locator("#render-status").evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(contrast(errorColors.color, errorColors.background)).toBeGreaterThanOrEqual(4.5);
});
