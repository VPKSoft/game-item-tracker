import { describe, expect, it, vi } from "vitest";
import { imageFromDataTransfer, readClipboardImage } from "./ImageInput.ts";
import { computeTargetSize, encodeWithinLimit, hashImage, validateImageFile } from "./ImageResize.ts";

const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

describe("computeTargetSize", () => {
    it("scales down to fit 128 px keeping the aspect ratio", () => {
        expect(computeTargetSize(1024, 512)).toEqual({ width: 128, height: 64 });
        expect(computeTargetSize(300, 900)).toEqual({ width: 43, height: 128 });
    });

    it("never scales up", () => {
        expect(computeTargetSize(65, 40)).toEqual({ width: 65, height: 40 });
    });

    it("keeps at least one pixel", () => {
        expect(computeTargetSize(10_000, 1)).toEqual({ width: 128, height: 1 });
    });
});

describe("validateImageFile", () => {
    it("accepts images up to 10 MB and rejects others", () => {
        expect(validateImageFile(blobOf(10, "image/png"))).toBeNull();
        expect(validateImageFile(blobOf(10, "text/plain"))?.message).toContain("not an image");
        expect(validateImageFile(blobOf(10 * 1024 * 1024 + 1, "image/png"))?.message).toContain("too large");
    });
});

describe("encodeWithinLimit", () => {
    it("returns the first WebP result when it fits", async () => {
        const encode = vi.fn(async () => blobOf(1000, "image/webp"));
        const blob = await encodeWithinLimit(encode);
        expect(blob.size).toBe(1000);
        expect(encode).toHaveBeenCalledWith("image/webp", 0.85);
        expect(encode).toHaveBeenCalledTimes(1);
    });

    it("steps the quality down until it fits", async () => {
        const encode = vi.fn(async (_type: string, quality: number) =>
            blobOf(quality > 0.6 ? 100_000 : 30_000, "image/webp")
        );
        const blob = await encodeWithinLimit(encode);
        expect(blob.size).toBe(30_000);
        expect(encode.mock.calls.map(c => c[1])).toEqual([0.85, 0.7, 0.55]);
    });

    it("fails when even the lowest quality is too large", async () => {
        await expect(encodeWithinLimit(async () => blobOf(100_000, "image/webp"))).rejects.toThrow("too large");
    });

    it("falls back to PNG when WebP is not supported", async () => {
        const encode = vi.fn(async () => blobOf(2000, "image/png"));
        const blob = await encodeWithinLimit(encode);
        expect(blob.type).toBe("image/png");
        expect(encode).toHaveBeenLastCalledWith("image/png", 1);
    });
});

describe("hashImage", () => {
    it("gives identical content the same id", async () => {
        const a = await hashImage(new Blob(["abc"]));
        const b = await hashImage(new Blob(["abc"]));
        const c = await hashImage(new Blob(["abd"]));
        expect(a).toBe(b);
        expect(a).not.toBe(c);
        expect(a).toMatch(/^[0-9a-f]{32}$/);
    });
});

describe("image input", () => {
    const transfer = (files: File[], items: { kind: string; type: string; getAsFile: () => File | null }[] = []) =>
        ({ files, items, types: ["Files"] }) as unknown as DataTransfer;

    it("takes the first image file from a drop", () => {
        const text = new File(["x"], "a.txt", { type: "text/plain" });
        const image = new File(["x"], "a.png", { type: "image/png" });
        expect(imageFromDataTransfer(transfer([text, image]))).toBe(image);
        expect(imageFromDataTransfer(transfer([text]))).toBeNull();
        expect(imageFromDataTransfer(null)).toBeNull();
    });

    it("takes an image from pasted clipboard items", () => {
        const image = new File(["x"], "image.png", { type: "image/png" });
        const data = transfer([], [{ kind: "file", type: "image/png", getAsFile: () => image }]);
        expect(imageFromDataTransfer(data)).toBe(image);
    });

    it("reads an image with the async clipboard API", async () => {
        const blob = new Blob(["x"], { type: "image/png" });
        vi.stubGlobal("navigator", {
            clipboard: { read: async () => [{ types: ["text/plain", "image/png"], getType: async () => blob }] },
        });
        const file = await readClipboardImage();
        expect(file?.type).toBe("image/png");
        vi.unstubAllGlobals();
    });
});
