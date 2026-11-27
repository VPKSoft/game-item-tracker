import { type HTMLElement, parse } from "node-html-parser";
import { uniqueId } from "../src/Domain/Ids.ts";
import type {
    Category,
    CounterDef,
    CounterProfile,
    Material,
    Template,
    TemplateItem,
} from "../src/Schemas/TemplateSchema.ts";
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

type BugRow = ImageRef & {
    name: string;
    description: string;
    rarity?: number;
    locations: string[];
    /** The time cell's text; empty when the wiki leaves it blank. */
    time: string;
    behavior: string;
    /** `Quest: …` and `Bundle: …` tags for the quests and bundles that need the bug. */
    neededFor: string[];
};

/** One way to get an item, from the "Obtained From" field of a wiki infobox. */
type ItemSource = {
    /** The shop, place or activity, e.g. "Chapaa Tchotchkes". */
    source: string;
    /** The cost lines under it, e.g. "900 Maji Market Ticket"; empty when there is no cost. */
    costs: string[];
};

/** The data of one item page (a page with a portable infobox). */
type WikiItem = ImageRef & {
    name: string;
    description: string;
    /** The infobox category, e.g. "Decor", "Consumable". */
    category: string;
    /** The infobox group, e.g. "Firework", "Dishes"; empty when there is none. */
    group: string;
    rarity?: number;
    /** The events the item belongs to, e.g. ["Maji Market", "Luna New Year"]. */
    events: string[];
    obtain: ItemSource[];
    recipeObtain: ItemSource[];
};

type StickerRow = ImageRef & {
    name: string;
    rarity?: number;
    /** The table's third column as "Label: value" (e.g. "Cost: 100 Palia Coins"), unless it is the rarity. */
    detail: string;
    /** The section heading the table is under, e.g. "Series 1 Stickers". */
    section: string;
};

type PotatoPodRow = ImageRef & {
    name: string;
    /** The pod set, e.g. "Bonsai Pods". */
    set: string;
};

/** An item that a bundle of the Bundles page asks for. */
/** An artifact on the Artifact Bundles page. */
type ArtifactRow = ImageRef & {
    name: string;
    /** The region (level-2 heading without " Artifacts"), e.g. "Royal Highlands", "Elderwoods". */
    region: string;
    /** The collection (level-3 heading), e.g. "Eloine's Bundle", "Ancient Artifact Collection". */
    collection: string;
    /** The artifact the pieces make up: the item name without its piece number, e.g. "Eloine's Crest". */
    artifact: string;
    description: string;
};

type BundleRow = ImageRef & {
    name: string;
    /** The vault the bundle belongs to, e.g. "Vault of the Waves". */
    vault: string;
    /** The bundle, e.g. "Spooky Bundle". */
    bundle: string;
    /** How many of the item the bundle needs (the "xN" under the item image). */
    amount: number;
    /** Where the item comes from, e.g. ["Bug Catching"], ["Mining", "Refining"], ["General Store"]. */
    sources: string[];
    /** The "How to Obtain" text under the source. */
    description: string;
    /** The bundle needs a star quality item (an `SQ.png` icon on the item box). */
    starred: boolean;
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

/** Known typos in the wiki's location names. */
const locationFixes: Record<string, string> = { "Steps or Renova": "Steps of Renova" };

/**
 * Reads a bug's "Needed For" cell: each entry is a type icon (alt "Daily Quest", "Brightbug Bundle", …)
 * linking to the same page as the entry's name link.
 */
const parseBugNeededFor = (cell: HTMLElement | undefined) => {
    if (!cell) {
        return [];
    }
    const links = cell.querySelectorAll("a");
    const tags = new Set<string>();
    for (const icon of links.filter(a => a.querySelector("img"))) {
        const alt = icon.querySelector("img")?.getAttribute("alt") ?? "";
        const href = icon.getAttribute("href");
        const name = links
            .find(a => !a.querySelector("img") && a.getAttribute("href") === href)
            ?.textContent.trim()
            // Link texts can carry the wiki's page disambiguation, e.g. "Jel's Pin (Quest)".
            .replace(/\s*\((?:Quest|Bundle)\)$/, "");
        if (!name) {
            continue;
        }
        tags.add(/bundle/i.test(alt) ? `Bundle: ${name}` : /quest/i.test(alt) ? `Quest: ${name}` : `Recipe: ${name}`);
    }
    return [...tags];
};

/** Parses the "List of Bugs" table (the paliatable with a Bug/Description/Rarity/Location header). */
const parseBugTable = (html: string, base = "https://palia.wiki.gg"): BugRow[] => {
    const root = parse(html);
    const table = root.querySelectorAll("table").find(t => {
        const headers = headerTexts(t);
        return headers[0] === "Bug" && headers.includes("Location") && headers.includes("Behavior");
    });
    if (!table) {
        throw new Error("The List of Bugs table was not found");
    }
    const headers = headerTexts(table);
    const col = (name: string) => headers.indexOf(name);
    const rows: BugRow[] = [];
    for (const tr of table.querySelectorAll("tr").slice(1)) {
        const cells = tr.querySelectorAll("td");
        if (cells.length < headers.length) {
            continue;
        }
        const nameCell = cells[col("Bug")];
        const name = cleanText(nameCell);
        if (!name) {
            continue;
        }
        rows.push({
            name,
            description: cleanText(cells[col("Description")]).replace(/\n/g, " "),
            rarity: rarityValue(cleanText(cells[col("Rarity")])),
            locations: cleanText(cells[col("Location")])
                .split("•")
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .map(l => locationFixes[l] ?? l),
            time: cleanText(cells[col("Time")]),
            behavior: cleanText(cells[col("Behavior")]),
            neededFor: parseBugNeededFor(cells[col("Needed For")]),
            imageUrl: fullImageUrl(nameCell.querySelector("img")?.getAttribute("src"), base),
        });
    }
    return rows;
};

/**
 * Reads an infobox "Obtained From" value: each source is a link on its own line, followed by
 * "• cost" lines. A cost icon links to its currency, so "• [ticket icon] 900" becomes "900 Maji Market Ticket".
 */
const parseItemSources = (value: HTMLElement | null) => {
    if (!value) {
        return [];
    }
    const copy = parse(value.innerHTML);
    for (const cost of copy.querySelectorAll(".template-cost")) {
        const amount = cost.querySelector("b")?.textContent.trim() ?? "";
        const currency = cost.querySelector("a")?.getAttribute("title") ?? "";
        cost.replaceWith(`${amount} ${currency}`.trim());
    }
    const sources: ItemSource[] = [];
    for (const line of copy.innerHTML.split(/<br\s*\/?>/i)) {
        const text = parse(line)
            .textContent.replace(/&#160;|&nbsp;| /g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!text) {
            continue;
        }
        const cost = text.match(/^•\s*(.*)$/);
        if (cost) {
            sources[sources.length - 1]?.costs.push(cost[1]);
        } else {
            sources.push({ source: text, costs: [] });
        }
    }
    return sources;
};

/** Parses an item page: the portable infobox and the description quote. */
const parseWikiItemPage = (name: string, html: string, base = "https://palia.wiki.gg"): WikiItem => {
    const root = parse(html);
    for (const style of root.querySelectorAll("style")) {
        style.remove();
    }
    const infobox = root.querySelector("aside.portable-infobox");
    if (!infobox) {
        throw new Error(`The page of ${name} has no infobox`);
    }
    const field = (key: string) => infobox.querySelector(`.pi-data[data-source="${key}"] .pi-data-value`);
    const text = (key: string) => cleanText(field(key) ?? undefined).replace(/\n/g, " ");
    return {
        name,
        description: cleanText(root.querySelector(".cquote .cquote-quote") ?? undefined).replace(/\n/g, " "),
        category: text("category"),
        group: text("group"),
        rarity: rarityValue(text("rarity")),
        events: (field("event")?.querySelectorAll("a") ?? []).map(a => a.textContent.trim()).filter(e => e.length > 0),
        obtain: parseItemSources(field("obtain")),
        recipeObtain: parseItemSources(field("recipeobtain")),
        imageUrl: fullImageUrl(infobox.querySelector("figure img")?.getAttribute("src"), base),
    };
};

/** Labels for the stickers tables' third column; the column header is used for others. */
const stickerDetailLabels: Record<string, string> = { "Chat Message": "Chat message" };

/**
 * Parses the sticker tables (Image/Name/… headers), one per section. The third column is the
 * rarity in some tables and a chat message, cost or way to obtain in others.
 */
const parseStickerTables = (html: string, base = "https://palia.wiki.gg"): StickerRow[] => {
    const root = parse(html);
    const container = root.querySelector(".mw-parser-output") ?? root;
    const rows: StickerRow[] = [];
    let section = "";

    const readTable = (table: HTMLElement) => {
        const headers = headerTexts(table);
        if (headers[0] !== "Image" || headers[1] !== "Name" || headers.length !== 3) {
            return;
        }
        for (const tr of table.querySelectorAll("tr").slice(1)) {
            const cells = tr.querySelectorAll("td");
            if (cells.length < 3) {
                continue;
            }
            const name = cleanText(cells[1]);
            if (!name) {
                continue;
            }
            const value = cleanText(cells[2]).replace(/\n/g, " ");
            const isRarity = headers[2] === "Rarity";
            rows.push({
                name,
                rarity: isRarity ? rarityValue(value) : undefined,
                detail: isRarity || !value ? "" : `${stickerDetailLabels[headers[2]] ?? headers[2]}: ${value}`,
                section: section || "Other Stickers",
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
                const h = /^H[234]$/.test(element.tagName) ? element : element.querySelector("h2, h3, h4");
                section = h?.textContent.replace(/\[edit\]/g, "").trim() ?? section;
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

/** Reads the skills from the Weekly Challenges page: the links in its level-3 headings. */
const parseWeeklyChallengeSkills = (html: string) => {
    const root = parse(html);
    return [
        ...new Set(
            root
                .querySelectorAll("h3")
                .map(h => h.querySelector("a")?.getAttribute("title")?.trim())
                .filter((t): t is string => !!t)
        ),
    ];
};

/**
 * Finds a skill page's guild: the link titled "<skill> Guild", or else the first link whose title ends
 * in " Guild". Undefined when the skill has no guild (e.g. Home Tours).
 */
const findGuildLink = (skill: string, html: string) => {
    const titles = parse(html)
        .querySelectorAll("a")
        .map(a => a.getAttribute("title")?.trim() ?? "");
    return titles.find(t => t === `${skill} Guild`) ?? titles.find(t => / Guild$/.test(t));
};

/** A row of a guild store table. */
type GuildStoreEntry = {
    /** The item's page title. */
    name: string;
    /** The price as text, e.g. "980 Bug Catching Medal" or "200 Gold - 3,000 Gold". */
    cost: string;
    /** The currencies of the price, e.g. ["Bug Catching Medal"]. */
    currencies: string[];
};

/**
 * Reads a guild store table (Item/Cost/… headers): each item with its price, leaving out the rows that
 * sell a recipe (marked with a bold "Recipe" next to the item). The first row of an item wins.
 */
const parseGuildStoreItems = (html: string): GuildStoreEntry[] => {
    const root = parse(html);
    const store = root.querySelectorAll("table").find(t => {
        const headers = headerTexts(t);
        return headers[0] === "Item" && headers.includes("Cost");
    });
    if (!store) {
        return [];
    }
    const headers = headerTexts(store);
    const entries: GuildStoreEntry[] = [];
    for (const tr of store.querySelectorAll(":scope > tbody > tr, :scope > tr").slice(1)) {
        const cells = tr.querySelectorAll(":scope > td");
        const cell = cells[0];
        if (!cell || cell.querySelectorAll("b").some(b => b.textContent.trim() === "Recipe")) {
            continue;
        }
        const name =
            cell.querySelector("table.template-item")?.getAttribute("data-item")?.trim() ??
            cell
                .querySelectorAll("a")
                .map(a => a.getAttribute("title")?.trim())
                .find(t => !!t);
        if (!name || entries.some(e => e.name === name)) {
            continue;
        }
        const costCell = parse(cells[headers.indexOf("Cost")]?.innerHTML ?? "");
        const currencies: string[] = [];
        for (const cost of costCell.querySelectorAll(".template-cost")) {
            const amount = cost.querySelector("b")?.textContent.trim() ?? "";
            const currency = cost.querySelector("a")?.getAttribute("title")?.trim() ?? "";
            currencies.push(currency);
            cost.replaceWith(`${amount} ${currency}`.trim());
        }
        // A row can sell a bundle: "50x SpeedyGro Fertilizer" or "Sneaky Smoke Bombx20".
        const label = cleanText(cell).replace(/\n/g, " ");
        const bundle = label.match(/^(\d+)x\s/)?.[1] ?? label.match(/x(\d+)$/)?.[1];
        const price = cleanText(costCell).replace(/\n/g, " ");
        entries.push({ name, cost: bundle ? `${price} for ${bundle}` : price, currencies });
    }
    return entries;
};

/** True when a store price is paid in guild medals only (not Gold). */
const isPaidWithMedals = (entry: GuildStoreEntry) =>
    entry.currencies.length > 0 && entry.currencies.every(c => / Medal$/.test(c));

/** True when the item's "Obtained From" lists the guild and nothing else. */
const isOnlyFromGuild = (item: WikiItem, guild: string) =>
    item.obtain.length > 0 && item.obtain.every(s => s.source === guild);

/** A reward listed on the Lucky Box or Super Lucky Prize page. */
type LuckyBoxReward = {
    /** The item's page title. */
    name: string;
    /** The reward section, e.g. "Decor", "Seed"; "Other" when the list has no headings. */
    section: string;
};

/**
 * Reads the "Possible Rewards" of a prize box page (Lucky Box, Super Lucky Prize): the item lists under
 * each level-3 heading of that section, or directly under it. The Lucky Box is what Zeki's Wondrous
 * Machine gives for a Lucky Coin.
 */
const parseLuckyBoxRewards = (html: string): LuckyBoxReward[] => {
    const root = parse(html);
    const rewards: LuckyBoxReward[] = [];
    let inRewards = false;
    let section = "";
    const walk = (node: HTMLElement) => {
        for (const child of node.childNodes) {
            const element = child as HTMLElement;
            if (!element.tagName) {
                continue;
            }
            const heading = /^H[23]$/.test(element.tagName)
                ? element
                : element.classList?.contains("mw-heading")
                  ? element.querySelector("h2, h3")
                  : null;
            if (heading) {
                const text = heading.textContent.replace(/\[edit\]/g, "").trim();
                if (heading.tagName === "H2") {
                    inRewards = text === "Possible Rewards";
                    section = "";
                } else if (inRewards) {
                    section = text;
                }
                continue;
            }
            if (inRewards && element.tagName === "LI") {
                const name = element.querySelector("[data-item]")?.getAttribute("data-item")?.trim();
                if (name && !rewards.some(r => r.name === name)) {
                    rewards.push({ name, section: section || "Other" });
                }
                continue;
            }
            walk(element);
        }
    };
    walk(root.querySelector(".mw-parser-output") ?? root);
    return rewards;
};

/** Reads the text of a heading without the "[edit]" link and decorations. */
const headingText = (heading: HTMLElement) =>
    (heading.querySelector(".mw-headline")?.textContent ?? heading.textContent).replace(/\[edit\]/g, "").trim();

/**
 * Parses the Bundles page: each vault (level-2 heading) has bundles (level-3 headings), and each bundle a
 * table with an "Items" header whose rows hold the item box (image, `<p class="number">xN</p>`, name) and
 * the "How to Obtain" cell (the source in large text, then a description). The reward row has no item box
 * and is skipped, and so are the "Vault Reward" sections, which have no item table. An item box with an
 * `<img alt="SQ.png">` star icon asks for a star quality item.
 */
const parseBundleTables = (html: string, base = "https://palia.wiki.gg"): BundleRow[] => {
    const root = parse(html);
    const rows: BundleRow[] = [];
    let vault = "";
    let bundle = "";
    const readTable = (table: HTMLElement) => {
        if (headerTexts(table)[0] !== "Items" || !vault || !bundle) {
            return;
        }
        for (const tr of table.querySelectorAll("tr")) {
            const box = tr.querySelector(".template-itembox");
            const cells = tr.querySelectorAll("td");
            if (!box || cells.length < 2) {
                continue;
            }
            const name =
                cleanText(box.querySelector(".caption") ?? undefined) || tr.getAttribute("data-checklist-id")?.trim();
            const amount = Number(box.querySelector("p.number")?.textContent.trim().replace(/^x/i, ""));
            if (!name || !Number.isInteger(amount) || amount < 1) {
                continue;
            }
            const how = cells[1];
            const sources = cleanText(how.querySelector("big") ?? undefined)
                .split(/\s*[+&]\s*/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
            const description = how
                .querySelectorAll("p")
                .map(p => cleanText(p))
                .filter(t => t.length > 0)
                .join("\n");
            const images = box.querySelectorAll("img");
            const isStarIcon = (img: HTMLElement) => img.getAttribute("alt") === "SQ.png";
            rows.push({
                name,
                vault,
                bundle,
                amount,
                sources,
                description,
                starred: images.some(isStarIcon),
                imageUrl: fullImageUrl(images.find(img => !isStarIcon(img))?.getAttribute("src"), base),
            });
        }
    };
    const walk = (node: HTMLElement) => {
        for (const child of node.childNodes) {
            const element = child as HTMLElement;
            if (!element.tagName) {
                continue;
            }
            const heading = /^H[23]$/.test(element.tagName)
                ? element
                : element.classList?.contains("mw-heading")
                  ? element.querySelector("h2, h3")
                  : null;
            if (heading) {
                const text = headingText(heading);
                if (heading.tagName === "H2") {
                    vault = /^Vault of /.test(text) ? text : "";
                    bundle = "";
                } else {
                    bundle = /Bundle$/.test(text) ? text : "";
                }
                continue;
            }
            if (element.tagName === "TABLE") {
                readTable(element);
                continue;
            }
            walk(element);
        }
    };
    walk(root.querySelector(".mw-parser-output") ?? root);
    return rows;
};

/**
 * Parses the Artifact Bundles page: each region (level-2 heading "… Artifacts") has collections (level-3
 * headings), and each collection a table per artifact with an "Items" header. A row's item box gives the
 * name and image, and the second cell the description. The artifact is named after its pieces ("Halward's
 * Glass 1" → "Halward's Glass"), not after the level-4 heading or the table id, because the wiki repeats
 * some headings ("Halward's Device" twice) and mislabels a table ("Wartorn Sword Bundle" for the horn).
 * The reward row has no item box and is skipped.
 */
const parseArtifactBundles = (html: string, base = "https://palia.wiki.gg"): ArtifactRow[] => {
    const root = parse(html);
    const rows: ArtifactRow[] = [];
    let region = "";
    let collection = "";
    const readTable = (table: HTMLElement) => {
        if (headerTexts(table)[0] !== "Items" || !region || !collection) {
            return;
        }
        for (const tr of table.querySelectorAll("tr")) {
            const box = tr.querySelector(".template-itembox");
            const cells = tr.querySelectorAll("td");
            if (!box || cells.length < 2) {
                continue;
            }
            const name =
                cleanText(box.querySelector(".caption") ?? undefined) || tr.getAttribute("data-checklist-id")?.trim();
            if (!name || rows.some(r => r.name === name)) {
                continue;
            }
            rows.push({
                name,
                region,
                collection,
                artifact: name.replace(/\s+\d+$/, ""),
                description: cleanText(cells[1]),
                imageUrl: fullImageUrl(box.querySelector("img")?.getAttribute("src"), base),
            });
        }
    };
    const walk = (node: HTMLElement) => {
        for (const child of node.childNodes) {
            const element = child as HTMLElement;
            if (!element.tagName) {
                continue;
            }
            const heading = /^H[234]$/.test(element.tagName)
                ? element
                : element.classList?.contains("mw-heading")
                  ? element.querySelector("h2, h3, h4")
                  : null;
            if (heading) {
                const text = headingText(heading);
                if (heading.tagName === "H2") {
                    const match = text.match(/^(.+) Artifacts$/);
                    region = match ? match[1] : "";
                    collection = "";
                } else if (heading.tagName === "H3") {
                    collection = text;
                }
                continue;
            }
            if (element.tagName === "TABLE") {
                readTable(element);
                continue;
            }
            walk(element);
        }
    };
    walk(root.querySelector(".mw-parser-output") ?? root);
    return rows;
};

/** Parses the "Available Pods" table (the table with an Image/Name/Set header). */
const parsePotatoPodTable = (html: string, base = "https://palia.wiki.gg"): PotatoPodRow[] => {
    const root = parse(html);
    const table = root.querySelectorAll("table").find(t => headerTexts(t).join("|") === "Image|Name|Set");
    if (!table) {
        throw new Error("The Available Pods table was not found");
    }
    const rows: PotatoPodRow[] = [];
    for (const tr of table.querySelectorAll("tr").slice(1)) {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 3) {
            continue;
        }
        const name = cleanText(cells[1]);
        if (!name) {
            continue;
        }
        rows.push({
            name,
            set: cleanText(cells[2]) || "Other",
            imageUrl: fullImageUrl(cells[0].querySelector("img")?.getAttribute("src"), base),
        });
    }
    return rows;
};

/** The counters of the fish and bugs samples: placed only for starred items. No tradeable counter: fish can only be gifted. */
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

/**
 * Builds the bugs template: categories by behavior (many bugs live in several locations), Normal and
 * ★ Starred variants and the fish counters.
 */
const buildBugTemplate = (rows: BugRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const row of rows) {
        const categoryName = row.behavior || "Other";
        let category = categories.find(c => c.name === categoryName);
        if (!category) {
            category = {
                id: uniqueId(
                    categoryName,
                    categories.map(c => c.id)
                ),
                name: categoryName,
                order: 0,
            };
            categories.push(category);
        }
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
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
                    ...row.locations.map(l => `Location: ${l}`),
                    ...(row.time ? parseTimes(row.time) : []).map(t => `Time: ${t}`),
                    ...(row.behavior ? [`Behavior: ${row.behavior}`] : []),
                    ...row.neededFor,
                ]),
            ],
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

/** The counters of the Maji Market and Prize Wheel samples: no variants, so Placed is a plain counter. */
const inventoryPlacedCounters = (): CounterDef[] => [
    { key: "inventory", label: "Inventory", kind: "manual", order: 0 },
    { key: "placed", label: "Placed", kind: "manual", order: 1 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["inventory", "placed"], role: "owned", order: 2 },
    { key: "target", label: "Target", kind: "manual", role: "target", order: 3 },
];

/**
 * Builds the Maji Market template: one category per shop, the item's other shops as tags, and the
 * prices in the description. An item bought as a recipe (e.g. Poke Bowl) gets `Type: Recipe`; its price is left out, because the
 * wiki lists recipe prices as a placeholder "1 Gold".
 *
 * @param shops The Maji Market shops, in category order.
 */
const buildMajiMarketTemplate = (items: WikiItem[], meta: TemplateMeta, shops: string[]) => {
    const template = baseTemplate(meta);
    const categories: Category[] = shops.map((shop, order) => ({
        id: uniqueId(shop, []),
        name: shop,
        order,
    }));
    const templateItems: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    const isShop = (source: ItemSource) => shops.includes(source.source);
    for (const item of items) {
        const shopSources = item.obtain.filter(isShop);
        const recipeSources = shopSources.length === 0 ? item.recipeObtain.filter(isShop) : [];
        const itemShops = [...new Set([...shopSources, ...recipeSources].map(s => s.source))];
        const shop = itemShops[0] ?? "Other";
        let category = categories.find(c => c.name === shop);
        if (!category) {
            category = {
                id: uniqueId(
                    shop,
                    categories.map(c => c.id)
                ),
                name: shop,
                order: categories.length,
            };
            categories.push(category);
        }
        const id = uniqueId(
            item.name,
            templateItems.map(i => i.id)
        );
        if (item.imageUrl && !/\/Unknown\.png$/i.test(item.imageUrl)) {
            imageUrls.set(id, item.imageUrl);
        }
        const prices = [
            ...shopSources.map(s => [s.source, ...s.costs].join(" • ")),
            ...recipeSources.map(s => `Recipe sold at ${s.source}`),
        ];
        templateItems.push({
            id,
            categoryId: category.id,
            name: item.name,
            description: [item.description, ...[...new Set(prices)]].filter(l => l.length > 0).join("\n"),
            attributes: item.rarity ? { rarity: item.rarity } : {},
            tags: [
                ...new Set([
                    ...itemShops.map(s => `Shop: ${s}`),
                    `Type: ${recipeSources.length > 0 ? "Recipe" : item.group || item.category || "Other"}`,
                    ...item.events.filter(e => e !== "Maji Market").map(e => `Event: ${e}`),
                ]),
            ],
        });
    }
    return {
        template: {
            ...template,
            counterDefs: inventoryPlacedCounters(),
            categories: categories.filter(c => templateItems.some(i => i.categoryId === c.id)),
            items: templateItems,
            tags: collectTags(templateItems),
        },
        imageUrls,
    };
};

/** The counters of the stickers sample: one amount, which is also the owned total. */
const stickerCounters = (): CounterDef[] => [
    { key: "amount", label: "Amount", kind: "manual", order: 0 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["amount"], role: "owned", order: 1 },
    { key: "target", label: "Target", kind: "manual", role: "target", order: 2 },
];

/**
 * The counter profiles of the stickers sample. "Single": the sticker is owned or not (Amount at most 1, with Total
 * and a Target of 1 hidden). "None": the sticker needs no tracking, so it has no counters.
 */
const stickerProfiles = (): CounterProfile[] => [
    {
        key: "single",
        label: "Single",
        overrides: { amount: { max: 1 }, total: { use: "hidden" }, target: { use: "hidden", value: 1 } },
    },
    {
        key: "none",
        label: "No counters",
        overrides: { amount: { use: "off" }, total: { use: "off" }, target: { use: "off" } },
    },
];

/**
 * Gets the counter profile of a sticker section: Default stickers every player has get none, series stickers keep
 * the normal counters, and the others (Premium, Other, …) are single.
 */
const stickerSectionProfile = (section: string) => {
    if (/^default\b/i.test(section)) {
        return "none";
    }
    return /^series\b/i.test(section) ? undefined : "single";
};

/** Builds the stickers template: one category per page section, in page order. */
const buildStickerTemplate = (rows: StickerRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const row of rows) {
        if (items.some(i => i.name === row.name)) {
            continue;
        }
        let category = categories.find(c => c.name === row.section);
        if (!category) {
            const counterProfile = stickerSectionProfile(row.section);
            category = {
                id: uniqueId(
                    row.section,
                    categories.map(c => c.id)
                ),
                name: row.section,
                order: categories.length,
                ...(counterProfile ? { counterProfile } : {}),
            };
            categories.push(category);
        }
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: category.id,
            name: row.name,
            description: row.detail,
            attributes: row.rarity ? { rarity: row.rarity } : {},
            tags: [],
        });
    }
    return {
        template: {
            ...template,
            counterDefs: stickerCounters(),
            counterProfiles: stickerProfiles(),
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/** The infobox source name of Zeki's Prize Wheel. */
const prizeWheelSource = "Zeki's Prize Wheel";

/**
 * Builds the Zeki's Prize Wheel template: one category per prize bag ("Decor Prize Bag", …), read from
 * the line under "Zeki's Prize Wheel" in the item's "Obtained From" field.
 */
const buildPrizeWheelTemplate = (items: WikiItem[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const templateItems: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const item of items) {
        const wheel = item.obtain.find(s => s.source === prizeWheelSource);
        const bag = wheel?.costs.find(c => /prize bag/i.test(c)) ?? "Other";
        let category = categories.find(c => c.name === bag);
        if (!category) {
            category = {
                id: uniqueId(
                    bag,
                    categories.map(c => c.id)
                ),
                name: bag,
                order: 0,
            };
            categories.push(category);
        }
        const id = uniqueId(
            item.name,
            templateItems.map(i => i.id)
        );
        if (item.imageUrl && !/\/Unknown\.png$/i.test(item.imageUrl)) {
            imageUrls.set(id, item.imageUrl);
        }
        templateItems.push({
            id,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            attributes: item.rarity ? { rarity: item.rarity } : {},
            tags: [`Type: ${item.group || item.category || "Other"}`],
        });
    }
    categories.sort((a, b) => a.name.localeCompare(b.name));
    categories.forEach((c, i) => {
        c.order = i;
    });
    return {
        template: {
            ...template,
            counterDefs: inventoryPlacedCounters(),
            categories,
            items: templateItems,
            tags: collectTags(templateItems),
        },
        imageUrls,
    };
};

/** One guild with its store rows and the item pages of those rows. */
type GuildStore = {
    guild: string;
    entries: { entry: GuildStoreEntry; item: WikiItem }[];
};

/**
 * Builds the guild exclusives template: the store items that are paid with guild medals and that the
 * guild is the only source of, one category per guild in the given order. Wiki page titles such as
 * "Wolpunny (Ranching)" lose the disambiguation. The description ends with the store price.
 */
const buildGuildExclusivesTemplate = (stores: GuildStore[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const store of stores) {
        const exclusives = store.entries.filter(
            ({ entry, item }) => isPaidWithMedals(entry) && isOnlyFromGuild(item, store.guild)
        );
        if (exclusives.length === 0) {
            continue;
        }
        const category: Category = {
            id: uniqueId(
                store.guild,
                categories.map(c => c.id)
            ),
            name: store.guild,
            order: categories.length,
        };
        categories.push(category);
        for (const { entry, item } of exclusives) {
            const name = item.name.replace(/\s*\([^)]*\)$/, "");
            if (items.some(i => i.name === name)) {
                continue;
            }
            const id = uniqueId(
                name,
                items.map(i => i.id)
            );
            if (item.imageUrl && !/\/Unknown\.png$/i.test(item.imageUrl)) {
                imageUrls.set(id, item.imageUrl);
            }
            items.push({
                id,
                categoryId: category.id,
                name,
                description: [item.description, `${store.guild} • ${entry.cost}`].filter(l => l.length > 0).join("\n"),
                attributes: item.rarity ? { rarity: item.rarity } : {},
                tags: [`Type: ${item.group || item.category || "Other"}`],
            });
        }
    }
    return {
        template: { ...template, counterDefs: inventoryPlacedCounters(), categories, items, tags: collectTags(items) },
        imageUrls,
    };
};

/** The infobox source name of Zeki's Wondrous Machine. */
const wondrousMachineSource = "Zeki's Wondrous Machine";

/** The infobox source name of the Super Lucky Prize. */
const superLuckyPrizeSource = "Super Lucky Prize";

/** The tags of the Zeki's Wondrous Machine sample. */
const wondrousMachineTags = {
    /** Every Lucky Box reward. */
    machine: "Wondrous Machine",
    /** Items the Super Lucky Prize can contain. */
    superLuckyPrize: "Super Lucky Prize",
    /** Items that only Zeki's Wondrous Machine gives. */
    unique: "Unique to Wondrous Machine",
};

/**
 * Builds the Zeki's Wondrous Machine template from the Lucky Box rewards: one category per reward section
 * in page order, a `Type: …` tag where the item has an infobox group, and the {@link wondrousMachineTags}.
 *
 * An item is in the Super Lucky Prize when that page lists it or the item's "Obtained From" names it; the
 * wiki keeps the two lists separately and neither is complete. The Super Lucky Prize is a Lunar Paths
 * reward, so its items are not unique to the machine.
 *
 * @param superLuckyPrize The item titles on the Super Lucky Prize page.
 */
const buildWondrousMachineTemplate = (
    rewards: { reward: LuckyBoxReward; item: WikiItem }[],
    meta: TemplateMeta,
    superLuckyPrize: string[] = []
) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const { reward, item } of rewards) {
        let category = categories.find(c => c.name === reward.section);
        if (!category) {
            category = {
                id: uniqueId(
                    reward.section,
                    categories.map(c => c.id)
                ),
                name: reward.section,
                order: categories.length,
            };
            categories.push(category);
        }
        const id = uniqueId(
            item.name,
            items.map(i => i.id)
        );
        if (item.imageUrl && !/\/Unknown\.png$/i.test(item.imageUrl)) {
            imageUrls.set(id, item.imageUrl);
        }
        items.push({
            id,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            attributes: item.rarity ? { rarity: item.rarity } : {},
            tags: (() => {
                const inSuperLuckyPrize =
                    superLuckyPrize.includes(reward.name) || item.obtain.some(s => s.source === superLuckyPrizeSource);
                const onlyMachine =
                    item.obtain.length > 0 && item.obtain.every(s => s.source === wondrousMachineSource);
                return [
                    ...(item.group ? [`Type: ${item.group}`] : []),
                    wondrousMachineTags.machine,
                    ...(inSuperLuckyPrize ? [wondrousMachineTags.superLuckyPrize] : []),
                    ...(onlyMachine && !inSuperLuckyPrize ? [wondrousMachineTags.unique] : []),
                ];
            })(),
        });
    }
    return {
        template: { ...template, counterDefs: inventoryPlacedCounters(), categories, items, tags: collectTags(items) },
        imageUrls,
    };
};

/**
 * Builds the Potato Pods template: categories by set, the plushie counters. The wiki lists no
 * rarity for pods, so the template has no rarity attribute.
 */
const buildPotatoPodTemplate = (rows: PotatoPodRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const row of rows) {
        let category = categories.find(c => c.name === row.set);
        if (!category) {
            category = {
                id: uniqueId(
                    row.set,
                    categories.map(c => c.id)
                ),
                name: row.set,
                order: 0,
            };
            categories.push(category);
        }
        if (items.some(i => i.name === row.name)) {
            continue;
        }
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: category.id,
            name: row.name,
            description: "",
            attributes: {},
            tags: [`Set: ${row.set}`],
        });
    }
    categories.sort((a, b) => a.name.localeCompare(b.name));
    categories.forEach((c, i) => {
        c.order = i;
    });
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: plushieCounters(),
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/**
 * The counters of the bundles sample: the bundle's need is a read-only target, filled from each item's
 * defaults, so the user only counts what is placed in the bundle, at most the target (`maxFrom`).
 */
const bundleCounters = (): CounterDef[] => [
    { key: "placed", label: "Placed", kind: "manual", maxFrom: "target", order: 0 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["placed"], role: "owned", order: 1 },
    { key: "target", label: "Target", kind: "manual", role: "target", readOnly: true, order: 2 },
];

/**
 * Builds the Bundles template: one parent category per vault and a child category per bundle, in page
 * order. An item that two bundles ask for becomes two items, because each bundle has its own target.
 * The target is the bundle's amount (`defaults.target` of a read-only counter). Tags `Vault: …`,
 * `Bundle: …` and `Source: …` (the skill or shop in "How to Obtain").
 *
 * A bundle that needs a star quality item gets " ★" after the name and the tag `Quality: Star`. The
 * template has no variants for this, so saves of earlier versions keep their counts; the item id still
 * comes from the plain name.
 */
const buildBundleTemplate = (rows: BundleRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    /** The plain item name of each item id, for finding duplicates. */
    const plainNames = new Map<string, string>();
    const imageUrls = new Map<string, string>();
    const findCategory = (name: string, parentId?: string) => {
        let category = categories.find(c => c.name === name && c.parentId === parentId);
        if (!category) {
            category = {
                id: uniqueId(
                    name,
                    categories.map(c => c.id)
                ),
                name,
                order: categories.filter(c => c.parentId === parentId).length,
                ...(parentId ? { parentId } : {}),
            };
            categories.push(category);
        }
        return category;
    };
    for (const row of rows) {
        const vault = findCategory(row.vault);
        const bundle = findCategory(row.bundle, vault.id);
        const isNamed = (item: TemplateItem) => plainNames.get(item.id) === row.name;
        if (items.some(i => i.categoryId === bundle.id && isNamed(i))) {
            continue;
        }
        const id = uniqueId(
            items.some(isNamed) ? `${row.name} ${row.bundle}` : row.name,
            items.map(i => i.id)
        );
        plainNames.set(id, row.name);
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: bundle.id,
            name: row.starred ? `${row.name} ★` : row.name,
            description: row.description,
            attributes: {},
            tags: [
                `Vault: ${row.vault}`,
                `Bundle: ${row.bundle}`,
                ...row.sources.map(s => `Source: ${s}`),
                ...(row.starred ? ["Quality: Star"] : []),
            ],
            defaults: { target: row.amount },
        });
    }
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: bundleCounters(),
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/**
 * The counters of the artifact bundles samples: one piece placed in the bundle (at most 1, a checkbox, and the
 * owned counter, so the progress bar and missing filter follow it), spare pieces in storage, Total = Storage,
 * and a read-only target of 1 (each item's `defaults.target`).
 */
const artifactCounters = (): CounterDef[] => [
    { key: "placed", label: "Placed", kind: "manual", max: 1, role: "owned", order: 0 },
    { key: "storage", label: "Storage", kind: "manual", order: 1 },
    { key: "total", label: "Total", kind: "computed", sumOf: ["storage"], order: 2 },
    { key: "target", label: "Target", kind: "manual", role: "target", readOnly: true, order: 3 },
];

/**
 * Builds an artifact bundles template from the rows of one region: a parent category per collection and a
 * child category per artifact, in page order. Tag `Collection: …`; the description is the wiki text.
 */
const buildArtifactBundleTemplate = (rows: ArtifactRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const categories: Category[] = [];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    const findCategory = (name: string, parentId?: string) => {
        let category = categories.find(c => c.name === name && c.parentId === parentId);
        if (!category) {
            category = {
                id: uniqueId(
                    name,
                    categories.map(c => c.id)
                ),
                name,
                order: categories.filter(c => c.parentId === parentId).length,
                ...(parentId ? { parentId } : {}),
            };
            categories.push(category);
        }
        return category;
    };
    for (const row of rows) {
        const collection = findCategory(row.collection);
        const artifact = findCategory(row.artifact, collection.id);
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl && !/\/Unknown\.png$/i.test(row.imageUrl)) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: artifact.id,
            name: row.name,
            description: row.description,
            attributes: {},
            tags: [`Collection: ${row.collection}`],
            defaults: { target: 1 },
        });
    }
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: artifactCounters(),
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/** An ingredient of a craftable item (a tint, a dish): the item name, the amount one needs and its image. */
type CraftIngredient = ImageRef & {
    name: string;
    amount: number;
};

/** A tint on the Tints page. */
type TintRow = ImageRef & {
    name: string;
    ingredients: CraftIngredient[];
    /** The hex colors the tint gives, e.g. "#3D3741". */
    colors: string[];
};

/** A food recipe (a dish) from its own page. */
type RecipeRow = ImageRef & {
    name: string;
    description: string;
    rarity?: number;
    /** The cooking station the dish is started at, e.g. "Standard Stove". */
    station: string;
    ingredients: CraftIngredient[];
};

/**
 * Parses an ingredient list: list entries with an item icon (`span.template-item`) whose bold text is the amount,
 * followed by a link with the name. The link text is used because `data-item` can be a link target, e.g.
 * "Fish#list" for "Any Fish".
 */
const parseIngredientList = (element: HTMLElement | null | undefined, base: string): CraftIngredient[] => {
    const ingredients: CraftIngredient[] = [];
    for (const li of element?.querySelectorAll("li") ?? []) {
        const icon = li.querySelector(".template-item");
        const link = li.childNodes.find(n => (n as HTMLElement).tagName === "A") as HTMLElement | undefined;
        const name = link?.text.trim() || icon?.getAttribute("data-item")?.trim();
        const amount = Number.parseInt(icon?.querySelector("b")?.text.trim() ?? "", 10);
        if (name && Number.isFinite(amount) && amount > 0) {
            ingredients.push({
                name,
                amount,
                imageUrl: fullImageUrl(icon?.querySelector("img")?.getAttribute("src"), base),
            });
        }
    }
    return ingredients;
};

/**
 * Parses the "List of Tints" table of the Tints page (headers Image, Name, Ingredients, Colors). The ingredients are
 * an ingredient list (`parseIngredientList`).
 */
const parseTints = (html: string, base = "https://palia.wiki.gg"): TintRow[] => {
    const root = parse(html);
    const rows: TintRow[] = [];
    for (const table of root.querySelectorAll("table")) {
        const headers = headerTexts(table);
        if (headers[1] !== "Name" || headers[2] !== "Ingredients") {
            continue;
        }
        for (const tr of table.querySelectorAll("tr")) {
            const cells = tr.querySelectorAll("td");
            if (cells.length < 3) {
                continue;
            }
            const name = cleanText(cells[1]);
            if (!name || rows.some(r => r.name === name)) {
                continue;
            }
            const colors = (cells[3]?.querySelectorAll(".template-hex > span") ?? [])
                .map(span => span.text.trim().toUpperCase())
                .filter(color => /^#[0-9A-F]{6}$/.test(color));
            rows.push({
                name,
                ingredients: parseIngredientList(cells[2], base),
                colors,
                imageUrl: fullImageUrl(cells[0].querySelector("img")?.getAttribute("src"), base),
            });
        }
    }
    return rows;
};

/**
 * Parses the page of a food recipe (a dish): name, rarity and image from the infobox (`parseWikiItemPage`), the
 * quote cited as the in-game item description, the starting cooking station (`crafter`) and the ingredient list
 * (`ingredients`).
 */
const parseRecipePage = (name: string, html: string, base = "https://palia.wiki.gg"): RecipeRow => {
    const item = parseWikiItemPage(name, html, base);
    const root = parse(html);
    const infobox = root.querySelector("aside.portable-infobox");
    const field = (key: string) => infobox?.querySelector(`.pi-data[data-source="${key}"] .pi-data-value`);
    // Some pages open with a flavor quote; the in-game description is the quote cited as such.
    const inGame = root
        .querySelectorAll(".cquote")
        .find(q => q.querySelector(".cquote-cite")?.text.includes("In-Game Item Description"))
        ?.querySelector(".cquote-quote");
    return {
        name: item.name,
        description: inGame ? cleanText(inGame).replace(/\n/g, " ") : item.description,
        rarity: item.rarity,
        station: field("crafter")?.querySelector("a")?.text.trim() ?? "",
        ingredients: parseIngredientList(field("ingredients"), base),
        imageUrl: item.imageUrl,
    };
};

/**
 * The counters of the craftable samples (tints, food recipes): whether the recipe is acquired (a checkbox), items in
 * the inventory (owned) and how many to craft (planned). To craft requires the recipe, so unlearned recipes add
 * nothing to the materials list.
 */
const craftCounters = (): CounterDef[] => [
    { key: "acquired", label: "Acquired", kind: "manual", max: 1, order: 0 },
    { key: "inventory", label: "Inventory", kind: "manual", role: "owned", order: 1 },
    { key: "to-craft", label: "To craft", kind: "manual", role: "planned", requires: "acquired", order: 2 },
];

/**
 * Builds the materials of a craftable template: one per ingredient name, sorted by name so the materials list is easy
 * to scan. Their images are returned under the key `material:<id>`.
 */
const buildCraftMaterials = (rows: { ingredients: CraftIngredient[] }[]) => {
    const all = rows.flatMap(r => r.ingredients);
    const names = [...new Set(all.map(i => i.name))].sort((a, b) => a.localeCompare(b));
    const materials: Material[] = [];
    const imageUrls = new Map<string, string>();
    for (const name of names) {
        const id = uniqueId(
            name,
            materials.map(m => m.id)
        );
        materials.push({ id, name, order: materials.length });
        const imageUrl = all.find(i => i.name === name && i.imageUrl)?.imageUrl;
        if (imageUrl) {
            imageUrls.set(`material:${id}`, imageUrl);
        }
    }
    const toMaterials = (ingredients: CraftIngredient[]) =>
        Object.fromEntries(ingredients.map(i => [materials.find(m => m.name === i.name)?.id ?? "", i.amount] as const));
    return { materials, imageUrls, toMaterials };
};

/**
 * Builds the tints template: one category, a material per ingredient and each tint's ingredients as its materials.
 * Tag `Ingredient: …`; the description lists the colors.
 */
const buildTintTemplate = (rows: TintRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const { materials, imageUrls, toMaterials } = buildCraftMaterials(rows);
    const items: TemplateItem[] = [];
    for (const row of rows) {
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: "tints",
            name: row.name,
            description: row.colors.length > 0 ? `Colors: ${row.colors.join(", ")}` : "",
            attributes: {},
            tags: row.ingredients.map(i => `Ingredient: ${i.name}`),
            materials: toMaterials(row.ingredients),
        });
    }
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: craftCounters(),
            categories: [{ id: "tints", name: "Tints", order: 0 }],
            materials,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/**
 * Builds the food recipes template like the tints template: one category, a material per ingredient (generic ones
 * such as "Any Fish" included) and the same counters. The description is the in-game text; attribute `rarity`;
 * tags `Ingredient: …` and `Station: …`. Recipes without ingredients are left out.
 */
const buildRecipeTemplate = (rows: RecipeRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const recipes = rows.filter(r => r.ingredients.length > 0).sort((a, b) => a.name.localeCompare(b.name));
    const { materials, imageUrls, toMaterials } = buildCraftMaterials(recipes);
    const items: TemplateItem[] = [];
    for (const row of recipes) {
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl) {
            imageUrls.set(id, row.imageUrl);
        }
        items.push({
            id,
            categoryId: "recipes",
            name: row.name,
            description: row.description,
            attributes: row.rarity !== undefined ? { rarity: row.rarity } : {},
            tags: [
                ...row.ingredients.map(i => `Ingredient: ${i.name}`),
                ...(row.station ? [`Station: ${row.station}`] : []),
            ],
            materials: toMaterials(row.ingredients),
        });
    }
    return {
        template: {
            ...template,
            counterDefs: craftCounters(),
            categories: [{ id: "recipes", name: "Food Recipes", order: 0 }],
            materials,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/**
 * Builds the food recipe items template: one item per distinct ingredient of the food recipes, as the wiki names it
 * (generic ones such as "Any Fish" stay one item; they are not expanded into every fish). Category *Common* for
 * ingredients that two or more recipes need and *Special* for those only one recipe needs; Common is the default
 * category. One counter, Amount. The description lists the recipes that need the item; tag `Recipe: …` per recipe.
 * Recipes without ingredients are ignored.
 */
const buildRecipeItemTemplate = (rows: RecipeRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const recipes = rows.filter(r => r.ingredients.length > 0).sort((a, b) => a.name.localeCompare(b.name));
    const uses = new Map<string, { recipes: string[]; imageUrl?: string }>();
    for (const recipe of recipes) {
        for (const ingredient of recipe.ingredients) {
            const use = uses.get(ingredient.name) ?? { recipes: [] };
            if (!use.recipes.includes(recipe.name)) {
                use.recipes.push(recipe.name);
            }
            use.imageUrl ??= ingredient.imageUrl;
            uses.set(ingredient.name, use);
        }
    }
    const categories: Category[] = [
        { id: "common", name: "Common", order: 0 },
        { id: "special", name: "Special", order: 1 },
    ];
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const name of [...uses.keys()].sort((a, b) => a.localeCompare(b))) {
        const use = uses.get(name);
        if (!use) {
            continue;
        }
        const id = uniqueId(
            name,
            items.map(i => i.id)
        );
        if (use.imageUrl) {
            imageUrls.set(id, use.imageUrl);
        }
        items.push({
            id,
            categoryId: use.recipes.length > 1 ? "common" : "special",
            name,
            description: `Used in: ${use.recipes.join(", ")}`,
            attributes: {},
            tags: use.recipes.map(r => `Recipe: ${r}`),
        });
    }
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: [{ key: "amount", label: "Amount", kind: "manual", order: 0 }] as CounterDef[],
            categories,
            defaultCategoryId: "common",
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

/** A decor item that is obtained once, from a "How to Obtain" table (the Wallpaper, Flooring and Roofing pages). */
type ObtainableRow = ImageRef & {
    name: string;
    /** The "How to Obtain" cell: places, shops or activities, each with its cost lines. */
    sources: ItemSource[];
};

/**
 * Parses the item table of the Wallpaper, Flooring or Roofing page (headers Image, Name, How to Obtain). The third cell has a line
 * per source and indented "•" lines with its cost or giver (`parseItemSources`), or "Unavailable".
 */
const parseObtainableTable = (html: string, base = "https://palia.wiki.gg"): ObtainableRow[] => {
    const root = parse(html);
    const rows: ObtainableRow[] = [];
    for (const table of root.querySelectorAll("table")) {
        const headers = headerTexts(table);
        if (headers[0] !== "Image" || headers[1] !== "Name" || headers[2] !== "How to Obtain") {
            continue;
        }
        for (const tr of table.querySelectorAll("tr")) {
            const cells = tr.querySelectorAll("td");
            if (cells.length < 3) {
                continue;
            }
            const name = cleanText(cells[1]);
            if (!name || rows.some(r => r.name === name)) {
                continue;
            }
            rows.push({
                name,
                sources: parseItemSources(cells[2]),
                imageUrl: fullImageUrl(cells[0].querySelector("img")?.getAttribute("src"), base),
            });
        }
    }
    return rows;
};

/**
 * The category of a source: the kind in trailing parentheses ("Paying Respects (Secret Puzzle)" →
 * "Secret Puzzle"), the part before " - " ("Accomplishment - Estate Builder" → "Accomplishment"), or the source.
 * The skill guild stores ("Mining Guild", …) share one group, "Guild Stores".
 */
const obtainSourceGroup = (source: string) => {
    const group = source.match(/\(([^)]+)\)$/)?.[1] ?? source.split(" - ")[0].trim();
    return /\bGuild$/.test(group) ? "Guild Stores" : group;
};

/**
 * Builds a template of decor that is obtained once (wallpapers, floors, roofing): a category per kind of the first source
 * (shops, Villager, Accomplishment, …), in name order with "Unavailable" last; one counter, Obtained (max 1, a
 * checkbox, no role: such decor is obtained once
 * and cannot be traded). The description lists the sources with their costs; tag `Source: …` per source and
 * `Villager: …` for villager gifts.
 */
const buildObtainableTemplate = (rows: ObtainableRow[], meta: TemplateMeta) => {
    const template = baseTemplate(meta);
    const groupOf = (row: ObtainableRow) => obtainSourceGroup(row.sources[0]?.source ?? "Unavailable");
    const groups = [...new Set(rows.map(groupOf))].sort((a, b) =>
        a === "Unavailable" ? 1 : b === "Unavailable" ? -1 : a.localeCompare(b)
    );
    const categories: Category[] = [];
    for (const group of groups) {
        categories.push({
            id: uniqueId(
                group,
                categories.map(c => c.id)
            ),
            name: group,
            order: categories.length,
        });
    }
    const items: TemplateItem[] = [];
    const imageUrls = new Map<string, string>();
    for (const row of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
        const id = uniqueId(
            row.name,
            items.map(i => i.id)
        );
        if (row.imageUrl) {
            imageUrls.set(id, row.imageUrl);
        }
        const sources = row.sources.filter(s => s.source !== "Unavailable");
        items.push({
            id,
            categoryId: categories.find(c => c.name === groupOf(row))?.id ?? categories[0].id,
            name: row.name,
            description: sources
                .map(s => (s.costs.length > 0 ? `${s.source}: ${s.costs.join(", ")}` : s.source))
                .join("\n"),
            attributes: {},
            tags: [
                ...new Set([
                    ...sources.map(s => `Source: ${s.source}`),
                    ...sources.filter(s => s.source === "Villager").flatMap(s => s.costs.map(c => `Villager: ${c}`)),
                ]),
            ],
        });
    }
    return {
        template: {
            ...template,
            attributeDefs: [],
            counterDefs: [{ key: "obtained", label: "Obtained", kind: "manual", max: 1, order: 0 }] as CounterDef[],
            categories,
            items,
            tags: collectTags(items),
        },
        imageUrls,
    };
};

export type {
    ArtifactRow,
    BugRow,
    BundleRow,
    CraftIngredient,
    FishRow,
    GuildStore,
    GuildStoreEntry,
    ItemSource,
    LuckyBoxReward,
    ObtainableRow,
    PlushieRow,
    PotatoPodRow,
    RecipeRow,
    StickerRow,
    TemplateMeta,
    TintRow,
    WikiItem,
};
export {
    buildArtifactBundleTemplate,
    buildBugTemplate,
    buildBundleTemplate,
    buildFishTemplate,
    buildGuildExclusivesTemplate,
    buildMajiMarketTemplate,
    buildObtainableTemplate,
    buildPlushieTemplate,
    buildPotatoPodTemplate,
    buildPrizeWheelTemplate,
    buildRecipeItemTemplate,
    buildRecipeTemplate,
    buildStickerTemplate,
    buildTintTemplate,
    buildWondrousMachineTemplate,
    cleanText,
    findGuildLink,
    fullImageUrl,
    isOnlyFromGuild,
    isPaidWithMedals,
    parseArtifactBundles,
    parseBait,
    parseBugTable,
    parseBundleTables,
    parseFishTable,
    parseGuildStoreItems,
    parseItemSources,
    parseLuckyBoxRewards,
    parseObtainableTable,
    parsePlushieTables,
    parsePotatoPodTable,
    parseRecipePage,
    parseStickerTables,
    parseTimes,
    parseTints,
    parseWeeklyChallengeSkills,
    parseWikiItemPage,
};
