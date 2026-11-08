/** The maximum width and height of a stored item image, in pixels. */
const maxImageSide = 128;

/** The largest input file that is accepted, in bytes. */
const maxInputBytes = 10 * 1024 * 1024;

/** The largest stored image, in bytes. */
const maxOutputBytes = 64 * 1024;

/** The first encoding quality that is tried. */
const initialQuality = 0.85;

/** The result of resizing an image. */
type ResizedImage = {
    blob: Blob;
    dataUrl: string;
    width: number;
    height: number;
    type: string;
};

/** Encodes the canvas content into a blob of the given type and quality. */
type Encoder = (type: string, quality: number) => Promise<Blob>;

/** Gets an error message when the file cannot be used as an image, otherwise null. */
const validateImageFile = (file: Blob): string | null => {
    if (!file.type.startsWith("image/")) {
        return "The file is not an image.";
    }
    if (file.size > maxInputBytes) {
        return `The image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The maximum is 10 MB.`;
    }
    return null;
};

/** Computes the size of the scaled-down image. Keeps the aspect ratio and never scales up. */
const computeTargetSize = (width: number, height: number, maxSide = maxImageSide) => {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

/**
 * Encodes as WebP, stepping the quality down until the result fits within `maxBytes`.
 * Falls back to PNG when the browser cannot encode WebP.
 */
const encodeWithinLimit = async (encode: Encoder, maxBytes = maxOutputBytes): Promise<Blob> => {
    let quality = initialQuality;
    let blob = await encode("image/webp", quality);
    if (blob.type !== "image/webp") {
        // The browser fell back to PNG; PNG has no quality setting.
        blob = await encode("image/png", 1);
        if (blob.size > maxBytes) {
            throw new Error("The resized image is too large to store.");
        }
        return blob;
    }
    while (blob.size > maxBytes && quality > 0.3) {
        quality = Math.round((quality - 0.15) * 100) / 100;
        blob = await encode("image/webp", quality);
    }
    if (blob.size > maxBytes) {
        throw new Error("The resized image is too large to store.");
    }
    return blob;
};

const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

/** Converts a data URL back into a blob. */
const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

/** Resizes an image file in the browser into a small WebP (or PNG) image. */
const resizeImage = async (file: Blob): Promise<ResizedImage> => {
    const error = validateImageFile(file);
    if (error) {
        throw new Error(error);
    }
    const bitmap = await createImageBitmap(file);
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Image resizing is not supported in this browser.");
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const encode: Encoder = (type, quality) =>
        new Promise((resolve, reject) => {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Encoding the image failed."))), type, quality);
        });
    const blob = await encodeWithinLimit(encode);
    return { blob, dataUrl: await blobToDataUrl(blob), width, height, type: blob.type };
};

/** Creates a content hash id for an image so identical images are stored once. */
const hashImage = async (blob: Blob) => {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)]
        .slice(0, 16)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
};

export type { Encoder, ResizedImage };
export {
    blobToDataUrl,
    computeTargetSize,
    dataUrlToBlob,
    encodeWithinLimit,
    hashImage,
    maxImageSide,
    maxInputBytes,
    maxOutputBytes,
    resizeImage,
    validateImageFile,
};
