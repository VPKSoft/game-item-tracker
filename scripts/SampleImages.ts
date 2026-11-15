import sharp from "sharp";

/**
 * Sets the color of fully transparent pixels to black, in place. The wiki's CDN re-optimizes its PNGs
 * from time to time, which keeps every visible pixel but changes the colors hidden under transparent
 * ones. Resizing and WebP encoding carry those hidden colors into the output, so without this the same
 * picture gives different bytes (and a different image id) from one build to the next.
 *
 * @param rgba Raw pixels with 4 channels (RGBA).
 */
const clearHiddenColors = (rgba: Buffer) => {
    for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] === 0) {
            rgba[i] = 0;
            rgba[i + 1] = 0;
            rgba[i + 2] = 0;
        }
    }
    return rgba;
};

/**
 * Resizes like the app does: max 128 px, WebP, quality stepped down to stay ≤ 64 KB. Images with an
 * alpha channel get {@link clearHiddenColors} first, so that the output depends only on what is visible.
 */
const toWebp = async (input: Buffer) => {
    const { hasAlpha } = await sharp(input).metadata();
    let source = () => sharp(input);
    if (hasAlpha) {
        const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixels = clearHiddenColors(data);
        const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } };
        source = () => sharp(pixels, raw);
    }
    let quality = 85;
    for (;;) {
        const output = await source()
            .resize(128, 128, { fit: "inside", withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();
        if (output.length <= 64 * 1024 || quality <= 30) {
            return output;
        }
        quality -= 15;
    }
};

export { clearHiddenColors, toWebp };
