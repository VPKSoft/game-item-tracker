/**
 * Generates the Palia sample templates from palia.wiki.gg:
 *   npm run build-samples -- [--out <dir>] [--version 1.0.0] [--no-images]
 *
 * The output goes outside the repository by default (../game-item-tracker-data/P/Palia) and is never committed.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { validateTemplate } from "../src/Domain/Validation.ts";
import { fileNameFor, serialize } from "../src/Files/FileFormat.ts";
import { type Template, templateSchema } from "../src/Schemas/TemplateSchema.ts";
import { majiMarketItemNames, majiMarketShops } from "./MajiMarketItems.ts";
import {
    buildBugTemplate,
    buildFishTemplate,
    buildMajiMarketTemplate,
    buildPlushieTemplate,
    buildPotatoPodTemplate,
    buildPrizeWheelTemplate,
    buildStickerTemplate,
    parseBugTable,
    parseFishTable,
    parsePlushieTables,
    parsePotatoPodTable,
    parseStickerTables,
    parseWikiItemPage,
} from "./PaliaParsers.ts";

const wikiBase = "https://palia.wiki.gg";
const userAgent = "game-item-tracker-sample-builder/1.0 (+https://github.com/VPKSoft/game-item-tracker)";

// Fixed ids so that regenerating a newer version upgrades existing saves.
const fishTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e01";
const plushieTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e02";
const potatoPodTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e03";
const bugTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e04";
const majiMarketTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e05";
const stickerTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e06";
const prizeWheelTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e07";

const { values } = parseArgs({
    options: {
        out: { type: "string", default: resolve(process.cwd(), "..", "game-item-tracker-data", "P", "Palia") },
        version: { type: "string", default: "1.0.0" },
        "no-images": { type: "boolean", default: false },
    },
});

const fetchPageHtml = async (page: string) => {
    const url = `${wikiBase}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`;
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) {
        throw new Error(`Fetching ${page} failed: ${response.status}`);
    }
    const json = (await response.json()) as { parse?: { text?: string } };
    if (!json.parse?.text) {
        throw new Error(`The wiki returned no content for ${page}`);
    }
    return json.parse.text;
};

/** Lists the titles of the articles in a wiki category, following the API's continuation. */
const fetchCategoryMembers = async (category: string) => {
    const titles: string[] = [];
    let next: string | undefined;
    do {
        const url =
            `${wikiBase}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${category}`)}` +
            `&cmnamespace=0&cmlimit=500&format=json&formatversion=2${next ? `&cmcontinue=${encodeURIComponent(next)}` : ""}`;
        const response = await fetch(url, { headers: { "User-Agent": userAgent } });
        if (!response.ok) {
            throw new Error(`Fetching Category:${category} failed: ${response.status}`);
        }
        const json = (await response.json()) as {
            query?: { categorymembers?: { title: string }[] };
            continue?: { cmcontinue?: string };
        };
        titles.push(...(json.query?.categorymembers ?? []).map(m => m.title));
        next = json.continue?.cmcontinue;
    } while (next);
    if (titles.length === 0) {
        throw new Error(`Category:${category} has no articles`);
    }
    return titles;
};

/** Fetches and parses item pages one at a time, to be gentle with the wiki. */
const fetchItemPages = async (names: string[]) => {
    const items = [];
    for (const name of names) {
        items.push(parseWikiItemPage(name, await fetchPageHtml(name), wikiBase));
    }
    return items;
};

/** Resizes like the app does: max 128 px, WebP, quality stepped down to stay ≤ 64 KB. */
const toWebp = async (input: Buffer) => {
    let quality = 85;
    for (;;) {
        const output = await sharp(input)
            .resize(128, 128, { fit: "inside", withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();
        if (output.length <= 64 * 1024 || quality <= 30) {
            return output;
        }
        quality -= 15;
    }
};

const addImages = async (template: Template, imageUrls: Map<string, string>) => {
    const entries = [...imageUrls];
    let done = 0;
    const worker = async () => {
        for (;;) {
            const entry = entries.shift();
            if (!entry) {
                return;
            }
            const [itemId, url] = entry;
            try {
                const response = await fetch(url, { headers: { "User-Agent": userAgent } });
                if (!response.ok) {
                    throw new Error(String(response.status));
                }
                const webp = await toWebp(Buffer.from(await response.arrayBuffer()));
                const imageId = createHash("sha256").update(webp).digest("hex").slice(0, 32);
                template.images[imageId] = `data:image/webp;base64,${webp.toString("base64")}`;
                const item = template.items.find(i => i.id === itemId);
                if (item) {
                    item.imageId = imageId;
                }
            } catch (error) {
                console.warn(`  image for ${itemId} failed (${url}): ${String(error)}`);
            }
            done++;
            if (done % 25 === 0) {
                console.log(`  ${done} images…`);
            }
        }
    };
    // A few parallel downloads, to be gentle with the wiki.
    await Promise.all([worker(), worker(), worker()]);
};

const writeTemplate = async (template: Template) => {
    const parsed = templateSchema.safeParse(template);
    if (!parsed.success) {
        throw new Error(`Generated template is invalid: ${parsed.error.message}`);
    }
    const issues = validateTemplate(template);
    for (const issue of issues) {
        console.warn(`  problem: ${issue.message}`);
    }
    await mkdir(values.out, { recursive: true });
    const file = resolve(values.out, fileNameFor("template", template.name));
    await writeFile(file, serialize(template), "utf8");
    console.log(`Wrote ${file} (${template.items.length} items, ${Object.keys(template.images).length} images)`);
};

const main = async () => {
    console.log("Fetching Fish…");
    const fish = buildFishTemplate(parseFishTable(await fetchPageHtml("Fish"), wikiBase), {
        templateId: fishTemplateId,
        version: values.version,
        name: "Palia – Fish",
        description: "The fish of Palia, by location, with normal and starred variants.",
        sourceUrl: `${wikiBase}/wiki/Fish`,
    });
    if (!values["no-images"]) {
        await addImages(fish.template, fish.imageUrls);
    }
    await writeTemplate(fish.template);

    console.log("Fetching Plushies…");
    const plushies = buildPlushieTemplate(parsePlushieTables(await fetchPageHtml("Plushies"), wikiBase), {
        templateId: plushieTemplateId,
        version: values.version,
        name: "Palia – Plushies",
        description: "The plushies of Palia, by how they are obtained.",
        sourceUrl: `${wikiBase}/wiki/Plushies`,
    });
    for (const conflict of plushies.conflicts) {
        console.warn(`  conflict: ${conflict}`);
    }
    if (!values["no-images"]) {
        await addImages(plushies.template, plushies.imageUrls);
    }
    await writeTemplate(plushies.template);

    console.log("Fetching Potato Pods…");
    const pods = buildPotatoPodTemplate(parsePotatoPodTable(await fetchPageHtml("Potato_Pods"), wikiBase), {
        templateId: potatoPodTemplateId,
        version: values.version,
        name: "Palia – Potato Pods",
        description: "The Potato Pods of Palia, by set.",
        sourceUrl: `${wikiBase}/wiki/Potato_Pods`,
    });
    if (!values["no-images"]) {
        await addImages(pods.template, pods.imageUrls);
    }
    await writeTemplate(pods.template);

    console.log("Fetching Bugs…");
    const bugs = buildBugTemplate(parseBugTable(await fetchPageHtml("Bugs"), wikiBase), {
        templateId: bugTemplateId,
        version: values.version,
        name: "Palia – Bugs",
        description: "The bugs of Palia, by behavior, with normal and starred variants.",
        sourceUrl: `${wikiBase}/wiki/Bugs`,
    });
    if (!values["no-images"]) {
        await addImages(bugs.template, bugs.imageUrls);
    }
    await writeTemplate(bugs.template);

    console.log(`Fetching ${majiMarketItemNames.length} Maji Market item pages…`);
    const maji = buildMajiMarketTemplate(
        await fetchItemPages(majiMarketItemNames),
        {
            templateId: majiMarketTemplateId,
            version: values.version,
            name: "Palia – Maji Market",
            description: "The items sold at the Maji Market, by shop. Item list from paliatracker.com.",
            sourceUrl: `${wikiBase}/wiki/Maji_Market`,
        },
        majiMarketShops
    );
    if (!values["no-images"]) {
        await addImages(maji.template, maji.imageUrls);
    }
    await writeTemplate(maji.template);

    console.log("Fetching Stickers…");
    const stickers = buildStickerTemplate(parseStickerTables(await fetchPageHtml("Stickers"), wikiBase), {
        templateId: stickerTemplateId,
        version: values.version,
        name: "Palia – Stickers",
        description: "The stickers of Palia, by series.",
        sourceUrl: `${wikiBase}/wiki/Stickers`,
    });
    if (!values["no-images"]) {
        await addImages(stickers.template, stickers.imageUrls);
    }
    await writeTemplate(stickers.template);

    const wheelNames = await fetchCategoryMembers("Obtained from Zeki's Prize Wheel");
    console.log(`Fetching ${wheelNames.length} Zeki's Prize Wheel item pages…`);
    const wheel = buildPrizeWheelTemplate(await fetchItemPages(wheelNames), {
        templateId: prizeWheelTemplateId,
        version: values.version,
        name: "Palia – Zeki's Prize Wheel",
        description: "The prizes of Zeki's Prize Wheel, by prize bag.",
        sourceUrl: `${wikiBase}/wiki/Category:Obtained_from_Zeki%27s_Prize_Wheel`,
    });
    if (!values["no-images"]) {
        await addImages(wheel.template, wheel.imageUrls);
    }
    await writeTemplate(wheel.template);
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
