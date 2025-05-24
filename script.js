// script.js
// This file will contain the JavaScript logic for the image resizing tool.

let currentImage = null; // Global variable to store the loaded Image object

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // Get references to DOM elements
    const imageFileInput = document.getElementById('imageFile'); // Corrected ID
    const originalDimensionsDisplay = document.getElementById('originalDimensions');
    const outputWidthInput = document.getElementById('outputWidth');
    const outputHeightInput = document.getElementById('outputHeight');
    const resizeFitRadio = document.getElementById('resizeFit');
    const resizeCropRadio = document.getElementById('resizeCrop');
    const bgWhiteRadio = document.getElementById('bgWhite');
    const bgTransparentRadio = document.getElementById('bgTransparent');
    const outputFormatSelect = document.getElementById('outputFormat');
    const outputFilenameInput = document.getElementById('outputFilename');
    const previewCanvas = document.getElementById('previewCanvas'); // Keep for future use
    // const downloadButton = document.getElementById('downloadButton'); // Already defined below
    const presetTemplatesDiv = document.getElementById('presetTemplates');

    // Placeholder function for updating the preview
    function updatePreview() {
        console.log("updatePreview called");
        const previewCanvas = document.getElementById('previewCanvas');
        const ctx = previewCanvas.getContext('2d');
        const originalDimensionsDisplay = document.getElementById('originalDimensions'); // To display error messages

        if (!currentImage) {
            console.log("No image loaded, clearing preview and returning.");
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            // Optionally, display a message on canvas if needed, but clearing is usually enough
            return;
        }

        let outputWidth = parseInt(document.getElementById('outputWidth').value);
        let outputHeight = parseInt(document.getElementById('outputHeight').value);

        if (isNaN(outputWidth) || outputWidth <= 0 || isNaN(outputHeight) || outputHeight <= 0) {
            ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            // Display error message - using originalDimensionsDisplay for simplicity or create a dedicated error span
            const errorSpan = document.getElementById('outputSizeError') || document.createElement('span');
            errorSpan.id = 'outputSizeError';
            errorSpan.textContent = '有効な出力サイズを入力してください。';
            errorSpan.style.color = 'red';
            // Insert error message after the output height input, for example
            const outputHeightInput = document.getElementById('outputHeight');
            if (!document.getElementById('outputSizeError') && outputHeightInput.parentNode) {
                 outputHeightInput.parentNode.insertBefore(errorSpan, outputHeightInput.nextSibling);
            }
            // Set canvas to a small default size or its current size to show the cleared state
            previewCanvas.width = previewCanvas.width || 100; // Keep current or default
            previewCanvas.height = previewCanvas.height || 100;
            return;
        } else {
            const errorSpan = document.getElementById('outputSizeError');
            if (errorSpan) {
                errorSpan.remove();
            }
        }

        previewCanvas.width = outputWidth;
        previewCanvas.height = outputHeight;
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        const resizeOption = document.querySelector('input[name="resizeOption"]:checked').value;

        if (resizeOption === 'fit') {
            const bgOption = document.querySelector('input[name="backgroundOption"]:checked').value;
            if (bgOption === 'white') {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, outputWidth, outputHeight);
            } // For 'transparent', do nothing, as canvas is cleared to transparent by default

            const originalAspectRatio = currentImage.naturalWidth / currentImage.naturalHeight;
            const targetAspectRatio = outputWidth / outputHeight;
            let renderableWidth, renderableHeight, destX, destY;

            if (originalAspectRatio > targetAspectRatio) { // Image is wider than target area
                renderableWidth = outputWidth;
                renderableHeight = outputWidth / originalAspectRatio;
            } else { // Image is taller or same aspect ratio
                renderableHeight = outputHeight;
                renderableWidth = outputHeight * originalAspectRatio;
            }
            
            // Ensure positive dimensions (should be, due to outputWidth/Height > 0 check)
            renderableWidth = Math.max(1, renderableWidth);
            renderableHeight = Math.max(1, renderableHeight);

            destX = (outputWidth - renderableWidth) / 2;
            destY = (outputHeight - renderableHeight) / 2;

            ctx.drawImage(currentImage, destX, destY, renderableWidth, renderableHeight);

        } else if (resizeOption === 'crop') {
            const srcWidth = currentImage.naturalWidth;
            const srcHeight = currentImage.naturalHeight;
            const srcAspectRatio = srcWidth / srcHeight;
            const destAspectRatio = outputWidth / outputHeight;

            let cropX = 0, cropY = 0, cropWidth = srcWidth, cropHeight = srcHeight;

            if (srcAspectRatio > destAspectRatio) { // Original image is wider, crop sides
                cropWidth = srcHeight * destAspectRatio;
                cropX = (srcWidth - cropWidth) / 2;
            } else if (srcAspectRatio < destAspectRatio) { // Original image is taller, crop top/bottom
                cropHeight = srcWidth / destAspectRatio;
                cropY = (srcHeight - cropHeight) / 2;
            }
            // If aspect ratios are equal, no cropping needed, use full source image

            // Ensure crop dimensions are not negative or zero (can happen with extreme aspect ratios)
            if (cropWidth <= 0) cropWidth = 1;
            if (cropHeight <= 0) cropHeight = 1;
            if (cropX < 0) cropX = 0;
            if (cropY < 0) cropY = 0;


            ctx.drawImage(currentImage, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
        }
        console.log("Preview updated.");
    }

    // Event listener for file input
    imageFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];

        if (!file) {
            currentImage = null;
            originalDimensionsDisplay.textContent = '--- x ---';
            outputFilenameInput.value = '';
            previewCanvas.getContext('2d').clearRect(0, 0, previewCanvas.width, previewCanvas.height); // Clear canvas
            console.log("No file selected or selection cancelled.");
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                originalDimensionsDisplay.textContent = `幅: ${img.naturalWidth}px、高さ: ${img.naturalHeight}px`;
                
                // Set output filename without extension
                const fileNameWithoutExtension = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                outputFilenameInput.value = fileNameWithoutExtension;
                
                updatePreview(); // Call preview update
            };
            img.onerror = () => {
                currentImage = null;
                alert('画像の読み込みに失敗しました。');
                originalDimensionsDisplay.textContent = '--- x ---';
                outputFilenameInput.value = '';
            };
            img.src = reader.result;
        };

        reader.onerror = () => {
            currentImage = null;
            alert('ファイルの読み込みに失敗しました。');
            originalDimensionsDisplay.textContent = '--- x ---';
            outputFilenameInput.value = '';
        };

        reader.readAsDataURL(file);
    });

    // Add event listeners to input controls to call updatePreview
    outputWidthInput.addEventListener('input', updatePreview);
    outputHeightInput.addEventListener('input', updatePreview);
    resizeFitRadio.addEventListener('change', updatePreview);
    resizeCropRadio.addEventListener('change', updatePreview);
    bgWhiteRadio.addEventListener('change', updatePreview);
    bgTransparentRadio.addEventListener('change', updatePreview);
    outputFormatSelect.addEventListener('change', updatePreview);
    // No need to call updatePreview for outputFilenameInput change as it doesn't affect the visual preview

    // --- Download Functionality ---
    const downloadButton = document.getElementById('downloadButton');

    function downloadImage() {
        console.log("downloadImage called");
        const previewCanvas = document.getElementById('previewCanvas');

        // Check if there's an image and canvas has valid dimensions
        if (!currentImage || previewCanvas.width <= 0 || previewCanvas.height <= 0) {
            alert('ダウンロードする画像がありません。まず画像をアップロードして設定を調整してください。');
            console.log("Download attempt failed: No image or invalid canvas dimensions.");
            return;
        }

        const outputFormat = document.getElementById('outputFormat').value;
        let outputFilename = document.getElementById('outputFilename').value.trim();

        if (!outputFilename) {
            outputFilename = 'thumbnail';
            console.log("Output filename empty, defaulted to 'thumbnail'.");
        }

        let mimeType;
        let extension;

        switch (outputFormat) {
            case 'jpeg':
                mimeType = 'image/jpeg';
                extension = '.jpg';
                break;
            case 'png':
                mimeType = 'image/png';
                extension = '.png';
                break;
            case 'webp':
                mimeType = 'image/webp';
                extension = '.webp';
                break;
            default:
                console.warn(`Unknown output format: ${outputFormat}. Defaulting to PNG.`);
                mimeType = 'image/png';
                extension = '.png';
        }

        console.log(`Preparing download: Filename: ${outputFilename}${extension}, Format: ${outputFormat}, MIME: ${mimeType}`);

        // For JPEG and WebP, quality can be specified. 0.9 is a good default.
        // For PNG, the quality argument is ignored.
        const dataURL = previewCanvas.toDataURL(mimeType, 0.9);

        const link = document.createElement('a');
        link.href = dataURL;
        link.download = outputFilename + extension;

        document.body.appendChild(link); // Append to body
        link.click(); // Programmatically click the link to trigger download
        document.body.removeChild(link); // Remove the link after triggering download

        console.log("Download triggered.");
    }

    if (downloadButton) {
        downloadButton.addEventListener('click', downloadImage);
        console.log("Event listener for download button has been set up.");
    } else {
        console.error("Download button not found!");
    }
    
    // Initial setup (if any)
    console.log("Event listeners for controls have been set up.");

    // --- Preset Templates Functionality ---
    const presetDimensions = {
        driverLicense: { width: 613, height: 413 },
        passport: { width: 413, height: 531 },
        myNumber: { width: 348, height: 431 },
        rirekisho: { width: 354, height: 472 }
    };

    function applyPreset(presetName) {
        const dims = presetDimensions[presetName];
        if (dims) {
            outputWidthInput.value = dims.width;
            outputHeightInput.value = dims.height;
            updatePreview(); // Directly call updatePreview
            console.log(`Applied preset: ${presetName} (${dims.width}x${dims.height})`);
        } else {
            console.error(`Preset ${presetName} not found.`);
        }
    }

    const presetDriverLicenseButton = document.getElementById('presetDriverLicense');
    const presetPassportButton = document.getElementById('presetPassport');
    const presetMyNumberButton = document.getElementById('presetMyNumber');
    const presetRirekishoButton = document.getElementById('presetRirekisho');

    if (presetDriverLicenseButton) {
        presetDriverLicenseButton.addEventListener('click', () => applyPreset('driverLicense'));
    }
    if (presetPassportButton) {
        presetPassportButton.addEventListener('click', () => applyPreset('passport'));
    }
    if (presetMyNumberButton) {
        presetMyNumberButton.addEventListener('click', () => applyPreset('myNumber'));
    }
    if (presetRirekishoButton) {
        presetRirekishoButton.addEventListener('click', () => applyPreset('rirekisho'));
    }
    
    if (presetTemplatesDiv && !presetDriverLicenseButton && !presetPassportButton && !presetMyNumberButton && !presetRirekishoButton ) {
        console.warn("Preset template buttons not found, but the container exists. Check button IDs.");
    } else if (presetDriverLicenseButton || presetPassportButton || presetMyNumberButton || presetRirekishoButton) {
        console.log("Event listeners for preset buttons have been set up.");
    }


});
