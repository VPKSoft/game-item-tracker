import {
    type ExchangeImageLayout,
    type ExchangeMode,
    type ExchangeTile,
    layoutExchangeImage,
    type Rect,
} from "../Domain/Exchange.ts";
import { LocalizedError } from "../Types/LocalizedMessage.ts";
import { imageMessages } from "./ImageMessages.ts";

/** The color theme of the exchange image. */
type ExchangeImageTheme = "light" | "dark";

/** Everything needed to draw an exchange image. Texts are passed in already translated. */
type ExchangeImageInput = {
    title: string;
    headings: Record<ExchangeMode, string>;
    tiles: Record<ExchangeMode, ExchangeTile[]>;
    theme: ExchangeImageTheme;
    /** Undefined = automatic. */
    columns?: number;
    /** Pixel density: 2 draws every logical pixel as 2 × 2 pixels. */
    scale: number;
};

/** The subset of the canvas 2D context that the drawing uses (also implemented by test fakes). */
type DrawingContext = Pick<
    CanvasRenderingContext2D,
    | "beginPath"
    | "closePath"
    | "moveTo"
    | "arcTo"
    | "fill"
    | "stroke"
    | "fillRect"
    | "fillText"
    | "measureText"
    | "drawImage"
    | "setTransform"
    | "fillStyle"
    | "strokeStyle"
    | "lineWidth"
    | "font"
    | "textAlign"
    | "textBaseline"
>;

/** Something drawable with its natural size (an `HTMLImageElement` or an `ImageBitmap`). */
type TileImage = CanvasImageSource & { width: number; height: number };

const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const palettes: Record<
    ExchangeImageTheme,
    {
        background: string;
        text: string;
        mutedText: string;
        tile: string;
        tileBorder: string;
        placeholder: string;
        accent: Record<ExchangeMode, string>;
    }
> = {
    light: {
        background: "#ffffff",
        text: "#1f1f1f",
        mutedText: "#595959",
        tile: "#f5f5f5",
        tileBorder: "#d9d9d9",
        placeholder: "#e3e3e3",
        accent: { give: "#389e0d", need: "#0958d9" },
    },
    dark: {
        background: "#1f1f1f",
        text: "#f0f0f0",
        mutedText: "#bfbfbf",
        tile: "#2b2b2b",
        tileBorder: "#424242",
        placeholder: "#3a3a3a",
        accent: { give: "#49aa19", need: "#3c89e8" },
    },
};

/** The positions inside a 100 × 100 tile. */
const tileMetrics = {
    imageSize: 50,
    imageTop: 6,
    nameTop: 60,
    nameLineHeight: 12,
    nameFont: `600 11px ${fontFamily}`,
    variantTop: 85,
    variantFont: `10px ${fontFamily}`,
    badgeFont: `700 12px ${fontFamily}`,
    badgeHeight: 18,
    textInset: 5,
    radius: 6,
} as const;

/**
 * Breaks text into at most `maxLines` lines that fit `maxWidth`. Words longer than a line are split,
 * and the last line ends with an ellipsis when text is left over.
 */
const wrapText = (text: string, maxWidth: number, maxLines: number, measure: (s: string) => number): string[] => {
    const fits = (s: string) => measure(s) <= maxWidth;
    const lines: string[] = [];
    let current = "";
    const words = text.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < words.length && lines.length < maxLines) {
        const word = words[index];
        const candidate = current ? `${current} ${word}` : word;
        if (fits(candidate)) {
            current = candidate;
            index++;
            continue;
        }
        if (current) {
            lines.push(current);
            current = "";
            continue;
        }
        // A single word wider than the line: take as many characters as fit.
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) {
            cut--;
        }
        lines.push(word.slice(0, cut));
        words[index] = word.slice(cut);
    }
    if (current && lines.length < maxLines) {
        lines.push(current);
        current = "";
    }
    const leftOver = current !== "" || index < words.length;
    if (leftOver && lines.length > 0) {
        let last = lines[lines.length - 1];
        while (last.length > 0 && !fits(`${last}…`)) {
            last = last.slice(0, -1);
        }
        lines[lines.length - 1] = `${last.trimEnd()}…`;
    }
    return lines;
};

const roundedRect = (ctx: DrawingContext, r: Rect, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(r.x + radius, r.y);
    ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, radius);
    ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, radius);
    ctx.arcTo(r.x, r.y + r.height, r.x, r.y, radius);
    ctx.arcTo(r.x, r.y, r.x + r.width, r.y, radius);
    ctx.closePath();
};

const drawTile = (
    ctx: DrawingContext,
    rect: Rect,
    tile: ExchangeTile,
    mode: ExchangeMode,
    theme: ExchangeImageTheme,
    image: TileImage | undefined
) => {
    const palette = palettes[theme];
    const m = tileMetrics;
    roundedRect(ctx, { x: rect.x + 0.5, y: rect.y + 0.5, width: rect.width - 1, height: rect.height - 1 }, m.radius);
    ctx.fillStyle = palette.tile;
    ctx.fill();
    ctx.strokeStyle = palette.tileBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    const imageBox = { x: rect.x + (rect.width - m.imageSize) / 2, y: rect.y + m.imageTop, size: m.imageSize };
    if (image && image.width > 0 && image.height > 0) {
        const scale = Math.min(m.imageSize / image.width, m.imageSize / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(
            image,
            imageBox.x + (m.imageSize - width) / 2,
            imageBox.y + (m.imageSize - height) / 2,
            width,
            height
        );
    } else {
        roundedRect(ctx, { x: imageBox.x, y: imageBox.y, width: imageBox.size, height: imageBox.size }, 4);
        ctx.fillStyle = palette.placeholder;
        ctx.fill();
    }

    // Amount badge in the top right corner.
    const amountText = `×${tile.amount}`;
    ctx.font = m.badgeFont;
    const badgeWidth = Math.max(m.badgeHeight, ctx.measureText(amountText).width + 10);
    const badge = { x: rect.x + rect.width - badgeWidth - 3, y: rect.y + 3, width: badgeWidth, height: m.badgeHeight };
    roundedRect(ctx, badge, m.badgeHeight / 2);
    ctx.fillStyle = palette.accent[mode];
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(amountText, badge.x + badge.width / 2, badge.y + badge.height / 2 + 0.5);

    // Name (two lines, or one when there is a variant label) and the variant label.
    const textWidth = rect.width - m.textInset * 2;
    const centerX = rect.x + rect.width / 2;
    ctx.textBaseline = "top";
    ctx.font = m.nameFont;
    ctx.fillStyle = palette.text;
    const nameLines = wrapText(tile.name, textWidth, tile.variantLabel ? 2 : 3, s => ctx.measureText(s).width);
    nameLines.forEach((line, i) => {
        ctx.fillText(line, centerX, rect.y + m.nameTop + i * m.nameLineHeight);
    });
    if (tile.variantLabel) {
        ctx.font = m.variantFont;
        ctx.fillStyle = palette.mutedText;
        const [variant] = wrapText(tile.variantLabel, textWidth, 1, s => ctx.measureText(s).width);
        ctx.fillText(variant ?? "", centerX, rect.y + m.variantTop);
    }
};

/**
 * Draws the exchange image into a context sized `layout.width × layout.height × scale`.
 * `images` maps tile image data URLs to decoded images; tiles without one get a placeholder.
 */
const drawExchangeImage = (
    ctx: DrawingContext,
    layout: ExchangeImageLayout,
    input: ExchangeImageInput,
    images: ReadonlyMap<string, TileImage>
) => {
    const palette = palettes[input.theme];
    ctx.setTransform(input.scale, 0, 0, input.scale, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, layout.width, layout.height);

    if (layout.title) {
        ctx.font = `700 18px ${fontFamily}`;
        ctx.fillStyle = palette.text;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const [title] = wrapText(input.title, layout.title.width, 1, s => ctx.measureText(s).width);
        ctx.fillText(title ?? "", layout.title.x, layout.title.y + 2);
    }

    for (const section of layout.sections) {
        const { heading } = section;
        const tiles = input.tiles[section.mode];
        ctx.fillStyle = palette.accent[section.mode];
        roundedRect(ctx, { x: heading.x, y: heading.y + 5, width: 4, height: 16 }, 2);
        ctx.fill();
        ctx.font = `700 14px ${fontFamily}`;
        ctx.fillStyle = palette.text;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${input.headings[section.mode]} (${tiles.length})`, heading.x + 10, heading.y + 13);
        ctx.textAlign = "center";
        section.tiles.forEach((rect, i) => {
            const tile = tiles[i];
            if (tile) {
                drawTile(ctx, rect, tile, section.mode, input.theme, tile.image ? images.get(tile.image) : undefined);
            }
        });
    }
};

const loadImage = (src: string): Promise<TileImage | undefined> =>
    new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve(image);
        // A broken image gets the placeholder instead of failing the whole picture.
        image.onerror = () => resolve(undefined);
        image.src = src;
    });

/** Gets the layout of an exchange image input. */
const layoutFor = (input: ExchangeImageInput) =>
    layoutExchangeImage(
        { give: input.tiles.give.length, need: input.tiles.need.length },
        { columns: input.columns, hasTitle: input.title.trim().length > 0 }
    );

/** Renders the exchange image as a PNG blob in the browser. */
const renderExchangeImage = async (input: ExchangeImageInput): Promise<Blob> => {
    const layout = layoutFor(input);
    const sources = new Set([...input.tiles.give, ...input.tiles.need].flatMap(t => (t.image ? [t.image] : [])));
    const images = new Map<string, TileImage>();
    await Promise.all(
        [...sources].map(async src => {
            const image = await loadImage(src);
            if (image) {
                images.set(src, image);
            }
        })
    );
    await document.fonts?.ready;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(layout.width * input.scale);
    canvas.height = Math.ceil(layout.height * input.scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new LocalizedError(imageMessages, "canvasUnsupported");
    }
    drawExchangeImage(ctx, layout, input, images);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new LocalizedError(imageMessages, "encodingFailed"))),
            "image/png"
        )
    );
};

export type { DrawingContext, ExchangeImageInput, ExchangeImageTheme, TileImage };
export { drawExchangeImage, layoutFor, renderExchangeImage, wrapText };
