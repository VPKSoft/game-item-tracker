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
import { validateTemplate } from "../src/Domain/Validation.ts";
import { fileNameFor, serialize } from "../src/Files/FileFormat.ts";
import { type Template, templateSchema } from "../src/Schemas/TemplateSchema.ts";
import { majiMarketItemNames, majiMarketShops } from "./MajiMarketItems.ts";
import {
    buildArtifactBundleTemplate,
    buildBugTemplate,
    buildBundleTemplate,
    buildFishTemplate,
    buildGuildExclusivesTemplate,
    buildMajiMarketTemplate,
    buildPlushieTemplate,
    buildPotatoPodTemplate,
    buildPrizeWheelTemplate,
    buildStickerTemplate,
    buildTintTemplate,
    buildWondrousMachineTemplate,
    findGuildLink,
    isPaidWithMedals,
    parseArtifactBundles,
    parseBugTable,
    parseBundleTables,
    parseFishTable,
    parseGuildStoreItems,
    parseLuckyBoxRewards,
    parsePlushieTables,
    parsePotatoPodTable,
    parseStickerTables,
    parseTints,
    parseWeeklyChallengeSkills,
    parseWikiItemPage,
} from "./PaliaParsers.ts";
import { sortImages, toWebp } from "./SampleImages.ts";

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
const guildExclusivesTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e08";
const wondrousMachineTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e09";
const bundleTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e0a";
const royalHighlandsArtifactsTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e0b";
const elderwoodsArtifactsTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e0c";
const tintTemplateId = "5b0e6a59-3a43-4c2a-9a0f-6f1a4c1f7e0d";

const { values } = parseArgs({
    options: {
        out: { type: "string", default: resolve(process.cwd(), "..", "game-item-tracker-data", "P", "Palia") },
        version: { type: "string", default: "1.0.0" },
        "no-images": { type: "boolean", default: false },
    },
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** The least time between two page requests; the wiki answers 429 to long runs that go faster. */
const requestInterval = 500;
let lastRequest = 0;

/**
 * Fetches a page's rendered HTML, at most one request per {@link requestInterval}. On 429 or 503 it waits
 * as long as the Retry-After header says (or longer each time) and tries again.
 */
const fetchPageHtml = async (page: string) => {
    const url = `${wikiBase}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`;
    let problem = "";
    for (let attempt = 0; attempt < 8; attempt++) {
        await delay(Math.max(0, lastRequest + requestInterval - Date.now()));
        lastRequest = Date.now();
        const response = await fetch(url, { headers: { "User-Agent": userAgent } });
        if (!response.ok) {
            problem = `HTTP ${response.status}`;
            if (response.status === 429 || response.status >= 500) {
                const retryAfter = Number(response.headers.get("retry-after"));
                const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 15000;
                console.log(`  ${problem} for ${page}, waiting ${Math.round(wait / 1000)} s…`);
                await delay(wait);
            }
            continue;
        }
        const json = (await response.json().catch(() => undefined)) as
            | { parse?: { text?: string }; error?: { code?: string } }
            | undefined;
        if (json?.parse?.text) {
            return json.parse.text;
        }
        if (json?.error?.code === "missingtitle") {
            throw new Error(`The wiki has no page ${page}`);
        }
        problem = json?.error?.code ?? "no content";
    }
    throw new Error(`Fetching ${page} failed: ${problem}`);
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
                // Keys "material:<id>" are images of materials; the others are item ids.
                const target = itemId.startsWith("material:")
                    ? template.materials?.find(m => m.id === itemId.slice("material:".length))
                    : template.items.find(i => i.id === itemId);
                if (target) {
                    target.imageId = imageId;
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

const writeTemplate = async (unsorted: Template) => {
    const template = { ...unsorted, images: sortImages(unsorted.images) };
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

    console.log("Fetching the guild stores…");
    const stores = [];
    for (const skill of parseWeeklyChallengeSkills(await fetchPageHtml("Weekly Challenges"))) {
        const guild = findGuildLink(skill, await fetchPageHtml(skill));
        if (!guild) {
            console.log(`  ${skill}: no guild`);
            continue;
        }
        const entries = parseGuildStoreItems(await fetchPageHtml(guild)).filter(isPaidWithMedals);
        console.log(`  ${guild}: ${entries.length} store items paid with medals`);
        const items = await fetchItemPages(entries.map(e => e.name));
        stores.push({ guild, entries: entries.map((entry, i) => ({ entry, item: items[i] })) });
    }
    const guildExclusives = buildGuildExclusivesTemplate(stores, {
        templateId: guildExclusivesTemplateId,
        version: values.version,
        name: "Palia – Guild Store Exclusives",
        description: "Items that only the skill guilds sell, for guild medals, by guild.",
        sourceUrl: `${wikiBase}/wiki/Weekly_Challenges`,
    });
    if (!values["no-images"]) {
        await addImages(guildExclusives.template, guildExclusives.imageUrls);
    }
    await writeTemplate(guildExclusives.template);

    // The machine gives a Lucky Box for a Lucky Coin; the box holds the actual prize.
    const rewards = parseLuckyBoxRewards(await fetchPageHtml("Lucky Box"));
    const superLuckyPrize = parseLuckyBoxRewards(await fetchPageHtml("Super Lucky Prize")).map(r => r.name);
    console.log(`Fetching ${rewards.length} Zeki's Wondrous Machine item pages…`);
    const rewardItems = await fetchItemPages(rewards.map(r => r.name));
    const wondrous = buildWondrousMachineTemplate(
        rewards.map((reward, i) => ({ reward, item: rewardItems[i] })),
        {
            templateId: wondrousMachineTemplateId,
            version: values.version,
            name: "Palia – Zeki's Wondrous Machine",
            description: "The prizes of Zeki's Wondrous Machine, by type.",
            sourceUrl: `${wikiBase}/wiki/Lucky_Box`,
        },
        superLuckyPrize
    );
    if (!values["no-images"]) {
        await addImages(wondrous.template, wondrous.imageUrls);
    }
    await writeTemplate(wondrous.template);

    console.log("Fetching Bundles…");
    const bundles = buildBundleTemplate(parseBundleTables(await fetchPageHtml("Bundles"), wikiBase), {
        templateId: bundleTemplateId,
        version: values.version,
        name: "Palia – Bundles",
        description:
            "The items the vault bundles of Palia ask for, by vault and bundle. The target is the amount the bundle needs.",
        sourceUrl: `${wikiBase}/wiki/Bundles`,
    });
    if (!values["no-images"]) {
        await addImages(bundles.template, bundles.imageUrls);
    }
    await writeTemplate(bundles.template);

    console.log("Fetching Artifact Bundles…");
    const artifacts = parseArtifactBundles(await fetchPageHtml("Artifact_Bundles"), wikiBase);
    for (const [region, templateId] of [
        ["Royal Highlands", royalHighlandsArtifactsTemplateId],
        ["Elderwoods", elderwoodsArtifactsTemplateId],
    ]) {
        const rows = artifacts.filter(a => a.region === region);
        if (rows.length === 0) {
            throw new Error(`No ${region} artifacts were found on the Artifact Bundles page`);
        }
        const built = buildArtifactBundleTemplate(rows, {
            templateId,
            version: values.version,
            name: `Palia – ${region} Artifacts Bundle`,
            description: `The ${region} artifacts of Palia, by collection and artifact. Each piece is placed in its bundle once.`,
            sourceUrl: `${wikiBase}/wiki/Artifact_Bundles`,
        });
        if (!values["no-images"]) {
            await addImages(built.template, built.imageUrls);
        }
        await writeTemplate(built.template);
    }

    console.log("Fetching Tints…");
    const tints = buildTintTemplate(parseTints(await fetchPageHtml("Tints"), wikiBase), {
        templateId: tintTemplateId,
        version: values.version,
        name: "Palia – Tints",
        description:
            "The tints of Palia and their ingredients. Tick Acquired for the recipes you know, set To craft on the tints you want, and the Materials list shows the ingredients to gather.",
        sourceUrl: `${wikiBase}/wiki/Tints`,
    });
    if (tints.template.items.length === 0) {
        throw new Error("No tints were found on the Tints page");
    }
    if (!values["no-images"]) {
        await addImages(tints.template, tints.imageUrls);
    }
    await writeTemplate(tints.template);
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
