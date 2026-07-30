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
  const bytes = await makePng(page);
  await page.locator("#image-file").setInputFiles({
    name: "sample image.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  });

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
  const bytes = await makePng(page);
  await page.locator("#image-file").setInputFiles({
    name: "ratio.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  });

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

test("reports unsafe output dimensions and recovers", async ({ page }) => {
  const bytes = await makePng(page);
  await page.locator("#image-file").setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes)
  });

  await page.locator("#aspect-lock").uncheck();
  await page.locator("#output-width").fill("5000");
  await page.locator("#output-height").fill("5000");
  await expect(page.locator("#dimension-error")).toContainText("約1677万画素以下");
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
    if (url.origin !== "http://127.0.0.1:4173") externalRequests.push(request.url());
  });
  await page.reload();
  expect(externalRequests).toEqual([]);
});
