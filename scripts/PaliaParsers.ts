import { type HTMLElement, parse } from "node-html-parser";
import { uniqueId } from "../src/Domain/Ids.ts";
import type { Category, CounterDef, Template, TemplateItem } from "../src/Schemas/TemplateSchema.ts";
import { templateFormat, templateSchemaVersion } from "../src/Schemas/TemplateSchema.ts";

/** The rarity names of Palia, mapped to the 1–5 attribute scale. */
const rarityLevels = [
    { value: 1, label: "Common", color: "default" },
    { value: 2, label: "Uncommon", color: "green" },
    { value: 3, label: "Rare", color: "blue" },
    { value: 4, label: "Epic", color: "purple" },
    { value: 5, label: "Legendary", color: "gold" },
];

const rarityValue = (text: string) =>
    rarityLevels.find(l => l.label.toLowerCase() === text.trim().toLowerCase())?.value;

/** A table row with the item image reference. */
type ImageRef = {
    /** The full-size image URL (not the thumbnail). */
    imageUrl?: string;
};

type FishRow = ImageRef & {
    name: string;
    description: string;
    rarity?: number;
    location: string;
    time: string;
    bait: string[];
    neededFor: string[];
};

type PlushieRow = ImageRef & {
    name: string;
    obtain: string;
    obtainLinks: string[];
    tradeable: boolean;
    rarity?: number;
    /** The section path, e.g. ["Always Available Plushies", "Bug Catching"]. */
    section: string[];
};

/** Removes <style> blocks (template styles are inlined into cells) and collapses whitespace. */
const cleanText = (element: HTMLElement | undefined) => {
    if (!element) {
        return "";
    }
    const copy = parse(element.innerHTML);
    for (const style of copy.querySelectorAll("style")) {
        style.remove();
    }
    for (const br of copy.querySelectorAll("br")) {
        br.replaceWith("\n");
    }
    return copy.textContent
        .replace(/ /g, " ")
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .filter(line => line.length > 0)
        .join("\n");
};

/** Converts a MediaWiki thumbnail path into the absolute URL of the original file. */
const fullImageUrl = (src: string | undefined, base: string) => {
    if (!src) {
        return undefined;
    }
    const path = src.split("?")[0];
    const thumb = path.match(/^\/images\/thumb\/(.+?)\/\d+px-[^/]+$/);
    const original = thumb ? `/images/${thumb[1]}` : path;
    return new URL(original, base).toString();
};

const timeWords = ["Morning", "Day", "Evening", "Night"];

/** Turns a time cell such as "Morning and Day (3:00 AM - 6:00 PM)" into time-of-day tags. */
const parseTimes = (text: string) => {
    if (/any time|all day/i.test(text) || text.trim().length === 0) {
        return ["Any time"];
    }
    const withoutHours = text.replace(/\([^)]*\)/g, " ");
    return timeWords.filter(word => new RegExp(`\\b${word}\\b`, "i").test(withoutHours));
};

/** Normalizes the bait cell into bait names. */
const parseBait = (text: string) => {
    const result = new Set<string>();
    if (/glow ?worm/i.test(text)) {
        result.add("Glow Worm");
    }
    if (/\bworms?\b/i.test(text.replace(/glow ?worms?/gi, ""))) {
        result.add("Worm");
    }
    if (/\bnone\b|no bait/i.test(text) || result.size === 0) {
        result.add("No bait");
    }
    return [...result];
};

/** Classifies a "Needed For" entry by its icon's alt text. */
const neededForTag = (alt: string) => {
    if (/quest/i.test(alt)) {
        return `Quest: ${alt}`;
    }
    if (/bundle/i.test(alt)) {
        return `Bundle: ${alt}`;
    }
    return `Recipe: ${alt}`;
};

const headerTexts = (table: HTMLElement) =>
    table
        .querySelectorAll("tr")[0]
        ?.querySelectorAll("th")
        .map(th => th.textContent.trim()) ?? [];

/** Parses the "List of Fish" table (the paliatable with a Name/Description/Rarity/Location header). */
const parseFishTable = (html: string, base = "https://palia.wiki.gg"): FishRow[] => {
    const root = parse(html);
    const table = root.querySelectorAll("table").find(t => {
        const headers = headerTexts(t);
        return headers[0] === "Name" && headers.includes("Location") && headers.includes("Bait");
    });
    if (!table) {
        throw new Error("The List of Fish table was not found");
    }
    const headers = headerTexts(table);
    const col = (name: string) => headers.indexOf(name);
    const rows: FishRow[] = [];
    for (const tr of table.querySelectorAll("tr").slice(1)) {
        const cells = tr.querySelectorAll("td");
        if (cells.length < headers.length) {
            continue;
        }
        const nameCell = cells[col("Name")];
        const name = cleanText(nameCell);
        if (!name) {
            continue;
        }
        const neededCell = cells[col("Needed For")];
        const neededFor = [
            ...new Set(
                neededCell
                    ?.querySelectorAll("img")
                    .map(img =>
                        img
                            .getAttribute("alt")
                            ?.replace(/\.png$/i, "")
                            .trim()
                    )
                    .filter((alt): alt is string => !!alt)
                    .map(neededForTag) ?? []
            ),
        ];
        rows.push({
            name,
            description: cleanText(cells[col("Description")]).replace(/\n/g, " "),
            rarity: rarityValue(cleanText(cells[col("Rarity")])),
            location: cleanText(cells[col("Location")]),
            time: cleanText(cells[col("Time")]),
            bait: parseBait(cleanText(cells[col("Bait")])),
            neededFor,
            imageUrl: fullImageUrl(nameCell.querySelector("img")?.getAttribute("src"), base),
        });
    }
    return rows;
};

/** Parses every plushie table, remembering the section headings each table is under. */
const parsePlushieTables = (html: string, base = "https://palia.wiki.gg"): PlushieRow[] => {
    const root = parse(html);
    const container = root.querySelector(".mw-parser-output") ?? root;
    const headings: string[] = ["", "", ""];
    const rows: PlushieRow[] = [];

    const readHeading = (element: HTMLElement) => {
        const h = /^H[234]$/.test(element.tagName ?? "") ? element : element.querySelector("h2, h3, h4");
        if (!h) {
            return false;
        }
        const level = Number(h.tagName[1]) - 2;
        headings[level] = h.textContent.replace(/\[edit\]/g, "").trim();
        for (let i = level + 1; i < headings.length; i++) {
            headings[i] = "";
        }
        return true;
    };

    const readTable = (table: HTMLElement) => {
        const headers = headerTexts(table);
        if (headers.join("|") !== "Image|Name|How to Obtain|Rarity") {
            return;
        }
        for (const tr of table.querySelectorAll("tr").slice(1)) {
            const cells = tr.querySelectorAll("td");
            if (cells.length < 4) {
                continue;
            }
            const name = cleanText(cells[1]);
            if (!name) {
                continue;
            }
            const obtainLines = cleanText(cells[2])
                .split("\n")
                .map(l => l.replace(/^•\s*/, "").trim());
            const links = [
                ...new Set(
                    cells[2]
                        .querySelectorAll("a")
                        .map(a => a.textContent.trim())
                        .filter(t => t.length > 0)
                ),
            ];
            rows.push({
                name,
                obtain: obtainLines.filter(l => l !== "Trading").join(" • "),
                obtainLinks: links.filter(l => l !== "Trading"),
                tradeable: links.includes("Trading") || obtainLines.includes("Trading"),
                rarity: rarityValue(cleanText(cells[3])),
                section: headings.filter(h => h.length > 0),
                imageUrl: fullImageUrl(cells[0].querySelector("img")?.getAttribute("src"), base),
            });
        }
    };

    const walk = (node: HTMLElement) => {
        for (const child of node.childNodes) {
            const element = child as HTMLElement;
            if (!element.tagName) {
                continue;
            }
            if (element.classList?.contains("mw-heading") || /^H[234]$/.test(element.tagName)) {
                readHeading(element);
            } else if (element.tagName === "TABLE") {
                readTable(element);
            } else {
                walk(element);
            }
        }
    };
    walk(container);
    return rows;
};

/** The counters of the fish sample: placed only for starred fish. No tradeable counter: fish can only be gifted. */
const fishCounters = (): CounterDef[] => [
    { key: "inventory", label: "Inventory", kind: "manual", order: 0 },
    { key: "placed", label: "Placed", kind: "manual", variants: ["starred"], order: 1 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["inventory", "placed"], role: "owned", order: 2 },
    { key: "target", label: "Target", kind: "manual", role: "target", order: 3 },
];

/** The counters of the plushies sample. Plushies are placed or stored, so there is no inventory counter. */
const plushieCounters = (): CounterDef[] => [
    { key: "placed", label: "Placed", kind: "manual", order: 0 },
    { key: "storage", label: "Storage", kind: "manual", order: 1 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["placed", "storage"], role: "owned", order: 2 },
    { key: "target", label: "Target", kind: "manual", role: "target", order: 3 },
    { key: "tradeable", label: "Tradeable", kind: "manual", order: 4 },
];

type TemplateMeta = {
    templateId: string;
    version: string;
    name: string;
    description: string;
    sourceUrl: string;
};

const baseTemplate = (meta: TemplateMeta): Template => ({
    format: templateFormat,
    schemaVersion: templateSchemaVersion,
    templateId: meta.templateId,
    version: meta.version,
    game: "Palia",
    name: meta.name,
    description: meta.description,
    updatedAt: new Date().toISOString(),
    attributeDefs: [{ key: "rarity", label: "Rarity", min: 1, max: 5, levels: rarityLevels }],
    counterDefs: [],
    variantDefs: [],
    tags: [],
    categories: [],
    items: [],
    images: {},
    source: {
        name: "Palia Wiki (palia.wiki.gg)",
        url: meta.sourceUrl,
        license: "CC BY-SA 4.0; game assets © Singularity 6",
    },
});

const collectTags = (items: TemplateItem[]) =>
    [...new Set(items.flatMap(i => i.tags))].sort((a, b) => a.localeCompare(b));

/** Fish whose starred form can only be obtained once, so the starred variant is unique. */
const uniqueStarredFish = new Set(["Ancient Cloudminnow"]);

/** Builds the fish template: categories by location, Normal and ★ Starred variants. */
const buildFishTemplate = (rows: FishRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const row of rows) {
        let category = categories.find(c => c.name === row.location);
        if (!category) {
            category = {
                id: uniqueId(
                    row.location || "Unknown",
                    categories.map(c => c.id)
                ),
                name: row.location || "Unknown",
                order: 0,
            };
            categories.push(category);
        }
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: category.id,
            name: row.name,
            description: row.description,
            attributes: row.rarity ? { rarity: row.rarity } : {},
            tags: [
                ...new Set([
                    `Location: ${row.location}`,
                    ...parseTimes(row.time).map(t => `Time: ${t}`),
                    ...row.bait.map(b => `Bait: ${b}`),
                    ...row.neededFor,
                ]),
            ],
            ...(uniqueStarredFish.has(row.name) ? { unique: ["starred"] } : {}),
        });
    }
    categories.sort((a, b) => a.name.localeCompare(b.name));
    categories.forEach((c, i) => {
        c.order = i;
    });
    return {
        template: {
            ...template,
            variantDefs: [
                { key: "normal", label: "Normal", order: 0 },
                { key: "starred", label: "★ Starred", order: 1 },
            ],
            counterDefs: fishCounters(),
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/**
 * Builds the plushies template: categories from the page sections. A plushie listed in several
 * tables becomes one item in the first table's category, with the other sources as tags.
 */
const buildPlushieTemplate = (rows: PlushieRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    const conflicts: string[] = [];
    const byName = new Map<string, TemplateItem>();

    const categoryFor = (section: string[]) => {
        let parentId: string | undefined;
        let category: Category | undefined;
        for (const name of section) {
            category = categories.find(c => c.name === name && c.parentId === parentId);
            if (!category) {
                category = {
                    id: uniqueId(
                        name,
                        categories.map(c => c.id)
                    ),
                    name,
                    order: categories.length,
                    parentId,
                };
                categories.push(category);
            }
            parentId = category.id;
        }
        return category;
    };

    for (const row of rows) {
        const sectionName = row.section[row.section.length - 1] ?? "Other";
        const sourceTags = [`Source: ${sectionName}`, ...row.obtainLinks.filter(l => l !== sectionName)];
        if (row.tradeable) {
            sourceTags.push("tradeable");
        }
        if (row.section[0]?.startsWith("Unavailable")) {
            sourceTags.push("unavailable");
        }
        const existing = byName.get(row.name);
        if (existing) {
            existing.tags = [...new Set([...existing.tags, ...sourceTags])];
            if (row.obtain && !existing.description.includes(row.obtain)) {
                existing.description = `${existing.description}\n${row.obtain}`.trim();
            }
            if (row.rarity && existing.attributes.rarity !== row.rarity) {
                conflicts.push(
                    `${row.name}: rarity ${existing.attributes.rarity} kept, ${row.rarity} under "${sectionName}" ignored`
                );
            }
            continue;
        }
        const category = categoryFor(row.section.length > 0 ? row.section : ["Other"]);
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
            imageUrls.set(id, row.imageUrl);
        }
        const item: TemplateItem = {
            id,
            categoryId: category?.id ?? "other",
            name: row.name,
            description: row.obtain,
            attributes: row.rarity ? { rarity: row.rarity } : {},
            tags: [...new Set(sourceTags)],
        };
        items.push(item);
        byName.set(row.name, item);
    }
    return {
        template: { ...template, counterDefs: plushieCounters(), categories, items, tags: collectTags(items) },
        imageUrls,
        conflicts,
    };
};

export type { FishRow, PlushieRow, TemplateMeta };
export {
    buildFishTemplate,
    buildPlushieTemplate,
    cleanText,
    fullImageUrl,
    parseBait,
    parseFishTable,
    parsePlushieTables,
    parseTimes,
};
