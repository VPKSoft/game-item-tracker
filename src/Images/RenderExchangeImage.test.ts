import { describe, expect, it, vi } from "vitest";
import type { ExchangeTile } from "../Domain/Exchange.ts";
import { canCopyImage, copyImageToClipboard } from "../Files/FileIo.ts";
import {
    type DrawingContext,
    drawExchangeImage,
    type ExchangeImageInput,
    layoutFor,
    wrapText,
} from "./RenderExchangeImage.ts";

/** Every character is 6 px wide. */
const measure = (s: string) => s.length * 6;

describe("wrapText", () => {
    it("keeps short text on one line", () => {
        expect(wrapText("Bass", 90, 2, measure)).toEqual(["Bass"]);
    });

    it("wraps words and ends overflowing text with an ellipsis", () => {
        expect(wrapText("Ancient Cloudminnow", 90, 2, measure)).toEqual(["Ancient", "Cloudminnow"]);
        expect(wrapText("Silver Salmon of the Great Lake", 60, 2, measure)).toEqual(["Silver", "Salmon of…"]);
    });

    it("splits a word that is wider than a line", () => {
        expect(wrapText("Supercalifragilistic", 60, 2, measure)).toEqual(["Supercalif", "ragilistic"]);
        expect(wrapText("Supercalifragilisticexpialidocious", 60, 1, measure)).toEqual(["Supercali…"]);
    });

    it("returns nothing for empty text", () => {
        expect(wrapText("   ", 60, 2, measure)).toEqual([]);
    });
});

const tile = (name: string, amount: number, image?: string): ExchangeTile => ({
    key: name,
    name,
    variantLabel: "",
    amount,
    image,
});

/** A fake 2D context that records the drawn texts and images. */
const fakeContext = () => {
    const texts: string[] = [];
    const images: unknown[] = [];
    const ctx = {
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        arcTo: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        setTransform: vi.fn(),
        fillText: vi.fn((text: string) => texts.push(text)),
        measureText: vi.fn((text: string) => ({ width: measure(text) }) as TextMetrics),
        drawImage: vi.fn((image: unknown) => images.push(image)),
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        textAlign: "left",
        textBaseline: "top",
    };
    return { ctx: ctx as unknown as DrawingContext, texts, images, raw: ctx };
};

describe("drawExchangeImage", () => {
    it("draws the title, both headings, every tile name and amount, and the known images", () => {
        const input: ExchangeImageInput = {
            title: "My Fish",
            headings: { give: "Can give", need: "Looking for" },
            tiles: { give: [tile("Bass", 3, "data:a")], need: [tile("Koi", 1, "data:b"), tile("Eel", 12)] },
            theme: "dark",
            scale: 2,
        };
        const image = { width: 128, height: 64 } as unknown as HTMLImageElement;
        const { ctx, texts, images, raw } = fakeContext();
        drawExchangeImage(ctx, layoutFor(input), input, new Map([["data:a", image]]));
        expect(raw.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
        expect(texts).toEqual(["My Fish", "Can give (1)", "×3", "Bass", "Looking for (2)", "×1", "Koi", "×12", "Eel"]);
        // Only the decoded image is drawn, scaled to fit 50 px.
        expect(images).toEqual([image]);
        expect(raw.drawImage.mock.calls[0].slice(3)).toEqual([50, 25]);
    });

    it("leaves out the title when it is empty", () => {
        const input: ExchangeImageInput = {
            title: " ",
            headings: { give: "Give", need: "Need" },
            tiles: { give: [], need: [tile("Koi", 2)] },
            theme: "light",
            scale: 1,
        };
        const layout = layoutFor(input);
        expect(layout.title).toBeUndefined();
        const { ctx, texts } = fakeContext();
        drawExchangeImage(ctx, layout, input, new Map());
        expect(texts).toEqual(["Need (1)", "×2", "Koi"]);
    });
});

describe("copyImageToClipboard", () => {
    it("fails with a coded message when the clipboard cannot hold images", async () => {
        expect(canCopyImage()).toBe(false);
        await expect(copyImageToClipboard(new Blob())).rejects.toMatchObject({ code: "clipboardWriteUnsupported" });
    });

    it("writes the PNG as a clipboard item", async () => {
        const write = vi.fn(async () => undefined);
        class FakeClipboardItem {
            constructor(readonly items: Record<string, unknown>) {}
        }
        vi.stubGlobal("ClipboardItem", FakeClipboardItem);
        Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
        try {
            const png = new Blob(["x"], { type: "image/png" });
            await copyImageToClipboard(png);
            expect(write).toHaveBeenCalledWith([new FakeClipboardItem({ "image/png": png })]);
        } finally {
            vi.unstubAllGlobals();
            Reflect.deleteProperty(navigator, "clipboard");
        }
    });
});
