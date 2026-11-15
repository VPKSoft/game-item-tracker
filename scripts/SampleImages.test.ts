import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { clearHiddenColors, toWebp } from "./SampleImages.ts";

/**
 * A 128×128 RGBA picture: an opaque square with a soft edge on a transparent background. It is already
 * the target size, like many wiki images, so nothing is resized and the hidden colors reach the encoder.
 */
const picture = (hiddenColor: (i: number) => [number, number, number]) => {
    const size = 128;
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const inside = x >= 32 && x < 96 && y >= 32 && y < 96;
            const edge = !inside && x >= 28 && x < 100 && y >= 28 && y < 100;
            if (inside || edge) {
                pixels.set([200, 120, 40, inside ? 255 : 128], i);
            } else {
                pixels.set([...hiddenColor(i), 0], i);
            }
        }
    }
    return sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
        .png()
        .toBuffer();
};

describe("sample images", () => {
    it("clears the color of fully transparent pixels only", () => {
        const rgba = Buffer.from([10, 20, 30, 0, 40, 50, 60, 1, 70, 80, 90, 255]);
        expect([...clearHiddenColors(rgba)]).toEqual([0, 0, 0, 0, 40, 50, 60, 1, 70, 80, 90, 255]);
    });

    it("gives the same WebP whatever color is hidden under transparent pixels", async () => {
        const clean = await toWebp(await picture(() => [0, 0, 0]));
        const dirty = await toWebp(await picture(i => [(i * 7) & 255, (i * 13) & 255, (i * 31) & 255]));
        expect(dirty.equals(clean)).toBe(true);
        const { width, height } = await sharp(clean).metadata();
        expect([width, height]).toEqual([128, 128]);
    });

    it("keeps opaque images without an alpha channel", async () => {
        const opaque = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#336699" } })
            .png()
            .toBuffer();
        const webp = await toWebp(opaque);
        const { width, height, hasAlpha } = await sharp(webp).metadata();
        expect([width, height, hasAlpha]).toEqual([64, 32, false]);
    });
});
