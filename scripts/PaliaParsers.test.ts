import { describe, expect, it } from "vitest";
import { getVariantCounters } from "../src/Domain/Counters.ts";
import { validateTemplate } from "../src/Domain/Validation.ts";
import { templateSchema } from "../src/Schemas/TemplateSchema.ts";
import {
    buildBugTemplate,
    buildFishTemplate,
    buildMajiMarketTemplate,
    buildPlushieTemplate,
    buildPotatoPodTemplate,
    fullImageUrl,
    parseBait,
    parseBugTable,
    parseFishTable,
    parsePlushieTables,
    parsePotatoPodTable,
    parseTimes,
    parseWikiItemPage,
} from "./PaliaParsers.ts";

// Hand-written fixtures that mirror the wiki's table structure with made-up items.
const fishHtml = `
<div class="mw-parser-output">
<table class="paliatable sortable">
<tr><th>Name</th><th>Description</th><th>Rarity</th><th>Location</th><th>Time</th><th>Bait</th><th>Needed For</th></tr>
<tr>
<td><a href="/wiki/Test_Eel"><img alt="Test Eel.png" src="/images/thumb/Test_Eel.png/65px-Test_Eel.png?abc123"></a><br><div><a href="/wiki/Test_Eel"><span>Test Eel</span></a></div></td>
<td>A slippery test fish.<br>Found in caves.</td>
<td><style>.x{color:red}</style><font class="template-rarity"><b>Uncommon</b></font></td>
<td><a href="/wiki/Biomes#Caves"><span>Caves</span></a></td>
<td><style>.y{}</style><b>Morning and Day (3:00 AM - 6:00 PM)</b></td>
<td><a href="/wiki/Worm"><img alt="Worm" src="/images/thumb/Worm.png/28px-Worm.png?1"></a> <a href="/wiki/Worm">Worm</a></td>
<td><a><img alt="Daily Quest" src="/images/thumb/Daily_Quest_Icon.png/28px-Daily_Quest_Icon.png?2"></a> <a>Some Quest</a><br><a><img alt="Flamerod Bundle" src="/images/thumb/Fire.png/28px-Fire.png?3"></a> <a>Flamerod Bundle</a></td>
</tr>
<tr>
<td><a><img alt="Test Bass.png" src="/images/thumb/Test_Bass.png/65px-Test_Bass.png?def"></a><br><a><span>Test Bass</span></a></td>
<td>A plain test fish.</td>
<td><b>Common</b></td>
<td><a><span>Bahari Coast</span></a></td>
<td><b>Any Time</b></td>
<td>None</td>
<td></td>
</tr>
</table>
<table class="paliatable"><tr><th>Image</th><th>Name</th><th>Description</th></tr><tr><td></td><td>Not a fish</td><td></td></tr></table>
</div>`;

const plushHtml = `
<div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2>Always Available Plushies</h2></div>
<div class="mw-heading mw-heading3"><h3>Bug Catching</h3></div>
<table class="paliatable">
<tr><th>Image</th><th>Name</th><th>How to Obtain</th><th>Rarity</th></tr>
<tr>
<td><a href="/wiki/File:Test_Bee_Plush.png"><img src="/images/thumb/Test_Bee_Plush.png/100px-Test_Bee_Plush.png?aa"></a></td>
<td><a><span>Test Bee Plush</span></a></td>
<td><a><span>Bug Catching</span></a><br>&#160;&#160;• <a><img alt="Test Bee" src="/images/thumb/Test_Bee.png/28px-Test_Bee.png?bb"></a> <a>Test Bee</a><br><a><span>Trading</span></a><br></td>
<td><font><b>Epic</b></font></td>
</tr>
</table>
<div class="mw-heading mw-heading3"><h3>Kilima Catalogue</h3></div>
<table class="paliatable">
<tr><th>Image</th><th>Name</th><th>How to Obtain</th><th>Rarity</th></tr>
<tr><td colspan="4">No results were found</td></tr>
</table>
<div class="mw-heading mw-heading2"><h2>Event Plushies</h2></div>
<div class="mw-heading mw-heading3"><h3>Maji Market</h3></div>
<div class="mw-heading mw-heading4"><h4>Lantern Night</h4></div>
<table class="paliatable">
<tr><th>Image</th><th>Name</th><th>How to Obtain</th><th>Rarity</th></tr>
<tr>
<td><img src="/images/thumb/Unknown.png/28px-Unknown.png"></td>
<td>Lantern Plush</td>
<td><a>Maji Market</a></td>
<td><b>Rare</b></td>
</tr>
<tr>
<td><img src="/images/thumb/Test_Bee_Plush.png/100px-Test_Bee_Plush.png?aa"></td>
<td>Test Bee Plush</td>
<td><a>Maji Market</a></td>
<td><b>Rare</b></td>
</tr>
</table>
</div>`;

const meta = { templateId: "t", version: "1.0.0", name: "Test", description: "", sourceUrl: "https://example.test" };

describe("helpers", () => {
    it("converts thumbnail paths to full-size image URLs", () => {
        expect(fullImageUrl("/images/thumb/Test_Eel.png/65px-Test_Eel.png?abc", "https://palia.wiki.gg")).toBe(
            "https://palia.wiki.gg/images/Test_Eel.png"
        );
        expect(fullImageUrl("/images/Plain.png?x", "https://palia.wiki.gg")).toBe(
            "https://palia.wiki.gg/images/Plain.png"
        );
        expect(fullImageUrl(undefined, "https://palia.wiki.gg")).toBeUndefined();
    });

    it("normalizes times and baits", () => {
        expect(parseTimes("Morning and Day (3:00 AM - 6:00 PM)")).toEqual(["Morning", "Day"]);
        expect(parseTimes("All Day")).toEqual(["Any time"]);
        expect(parseTimes("Evening and Night (6:00 PM - 3:00 AM)")).toEqual(["Evening", "Night"]);
        expect(parseBait("None\n Worm")).toEqual(["Worm", "No bait"]);
        expect(parseBait("Glowworms")).toEqual(["Glow Worm"]);
        expect(parseBait("")).toEqual(["No bait"]);
    });
});

describe("fish", () => {
    it("parses the List of Fish table and ignores other tables", () => {
        const rows = parseFishTable(fishHtml, "https://palia.wiki.gg");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({
            name: "Test Eel",
            description: "A slippery test fish. Found in caves.",
            rarity: 2,
            location: "Caves",
            time: "Morning and Day (3:00 AM - 6:00 PM)",
            bait: ["Worm"],
            neededFor: ["Quest: Daily Quest", "Bundle: Flamerod Bundle"],
            imageUrl: "https://palia.wiki.gg/images/Test_Eel.png",
        });
    });

    it("builds a valid template with location categories, variants and starred-only placed", () => {
        const { template, imageUrls } = buildFishTemplate(parseFishTable(fishHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual(["Bahari Coast", "Caves"]);
        expect(template.variantDefs.map(v => v.key)).toEqual(["normal", "starred"]);
        expect(getVariantCounters(template, "normal").map(c => c.key)).not.toContain("placed");
        expect(getVariantCounters(template, "starred").map(c => c.key)).toContain("placed");
        expect(template.counterDefs.some(c => c.key === "tradeable")).toBe(false);
        expect(template.items[0].tags).toEqual(
            expect.arrayContaining(["Location: Caves", "Time: Morning", "Bait: Worm", "Bundle: Flamerod Bundle"])
        );
        expect(imageUrls.get("test-eel")).toBe("https://palia.wiki.gg/images/Test_Eel.png");
    });

    it("marks the starred Ancient Cloudminnow as unique", () => {
        const rows = parseFishTable(fishHtml);
        rows[1] = { ...rows[1], name: "Ancient Cloudminnow" };
        const { template } = buildFishTemplate(rows, meta);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.items.find(i => i.name === "Ancient Cloudminnow")?.unique).toEqual(["starred"]);
        expect(template.items.find(i => i.name === "Test Eel")?.unique).toBeUndefined();
    });

    it("fails clearly when the table is missing", () => {
        expect(() => parseFishTable("<p>nothing</p>")).toThrow("List of Fish");
    });
});

describe("plushies", () => {
    it("parses every table with its section path and skips empty tables", () => {
        const rows = parsePlushieTables(plushHtml, "https://palia.wiki.gg");
        expect(rows.map(r => [r.name, r.section.join(" > ")])).toEqual([
            ["Test Bee Plush", "Always Available Plushies > Bug Catching"],
            ["Lantern Plush", "Event Plushies > Maji Market > Lantern Night"],
            ["Test Bee Plush", "Event Plushies > Maji Market > Lantern Night"],
        ]);
        expect(rows[0]).toMatchObject({
            obtain: "Bug Catching • Test Bee",
            obtainLinks: ["Bug Catching", "Test Bee"],
            tradeable: true,
            rarity: 4,
        });
    });

    it("builds nested categories, merges duplicates and reports rarity conflicts", () => {
        const { template, imageUrls, conflicts } = buildPlushieTemplate(parsePlushieTables(plushHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.items.map(i => i.name)).toEqual(["Test Bee Plush", "Lantern Plush"]);
        const bee = template.items[0];
        expect(bee.attributes.rarity).toBe(4);
        expect(bee.tags).toEqual(
            expect.arrayContaining(["Source: Bug Catching", "Source: Lantern Night", "tradeable", "Test Bee"])
        );
        expect(conflicts).toHaveLength(1);
        const lantern = template.categories.find(c => c.name === "Lantern Night");
        const market = template.categories.find(c => c.id === lantern?.parentId);
        expect(market?.name).toBe("Maji Market");
        // Placeholder "Unknown" images are not downloaded.
        expect(imageUrls.has("lantern-plush")).toBe(false);
        expect(template.counterDefs.find(c => c.key === "total")?.sumOf).toEqual(["placed", "storage"]);
        expect(template.counterDefs.some(c => c.key === "inventory")).toBe(false);
    });
});

const podHtml = `
<div class="mw-parser-output">
<table class="paliatable sortable">
<tr><th>Image</th><th>Name</th><th>Set</th></tr>
<tr>
<td><img alt="Test the Bonsai Pod.png" src="/images/thumb/Test_the_Bonsai_Pod.png/64px-Test_the_Bonsai_Pod.png?aa"></td>
<td><a href="/wiki/Test_the_Bonsai_Pod"><span>Test the Bonsai Pod</span></a></td>
<td>Bonsai Pods</td>
</tr>
<tr>
<td><img alt="Sample the Merpod.png" src="/images/thumb/Sample_the_Merpod.png/64px-Sample_the_Merpod.png?bb"></td>
<td><a><span>Sample the Merpod</span></a></td>
<td>Merpods</td>
</tr>
<tr>
<td><img src="/images/thumb/Unknown.png/64px-Unknown.png?cc"></td>
<td>Example the Bonsai Pod</td>
<td>Bonsai Pods</td>
</tr>
</table>
<table class="navbox"><tr><th>Decor</th></tr><tr><td>Not a pod</td></tr></table>
</div>`;

describe("potato pods", () => {
    it("parses the pod table with sets and full-size image URLs", () => {
        const rows = parsePotatoPodTable(podHtml, "https://palia.wiki.gg");
        expect(rows.map(r => [r.name, r.set])).toEqual([
            ["Test the Bonsai Pod", "Bonsai Pods"],
            ["Sample the Merpod", "Merpods"],
            ["Example the Bonsai Pod", "Bonsai Pods"],
        ]);
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Test_the_Bonsai_Pod.png");
    });

    it("builds set categories with the plushie counters", () => {
        const { template, imageUrls } = buildPotatoPodTemplate(parsePotatoPodTable(podHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual(["Bonsai Pods", "Merpods"]);
        expect(template.items.map(i => i.tags)).toEqual([["Set: Bonsai Pods"], ["Set: Merpods"], ["Set: Bonsai Pods"]]);
        expect(template.attributeDefs).toEqual([]);
        expect(template.counterDefs.map(c => c.key)).toEqual(["placed", "storage", "total", "target", "tradeable"]);
        expect(imageUrls.has("example-the-bonsai-pod")).toBe(false);
    });

    it("fails clearly when the table is missing", () => {
        expect(() => parsePotatoPodTable("<p>nothing</p>")).toThrow("Available Pods");
    });
});

const bugHtml = `
<div class="mw-parser-output">
<table class="paliatable sortable">
<tr><th>Bug</th><th>Description</th><th>Rarity</th><th>Location</th><th>Time</th><th>Behavior</th><th>Needed For</th></tr>
<tr>
<td><span><a href="/wiki/Test_Mantis"><img alt="Test Mantis.png" src="/images/thumb/Test_Mantis.png/65px-Test_Mantis.png?aa"></a> <br><div><a href="/wiki/Test_Mantis"><span>Test Mantis</span></a></div></span></td>
<td>A made-up mantis.</td>
<td><style>.x{}</style><font class="template-rarity"><b>Uncommon</b></font></td>
<td><a><span>Kilima Fields</span></a> &#8226; <a><span>Steps or Renova</span></a></td>
<td><style>.y{}</style><b>Evening and Night (6:00 PM - 3:00 AM)</b></td>
<td>Jumping</td>
<td>* <a href="/wiki/Test_Quest" title="Daily Quest"><img alt="Daily Quest" src="/images/thumb/Daily_Quest_Icon.png/28px-Daily_Quest_Icon.png?1"></a> <a href="/wiki/Test_Quest">Test Quest (Quest)</a>
* <a href="/wiki/Test_Bundle"><img alt="Test Bundle" src="/images/thumb/Bundle.png/28px-Bundle.png?2"></a> <a href="/wiki/Test_Bundle">Test Bundle</a></td>
</tr>
<tr>
<td><a><img alt="Test Moth.png" src="/images/thumb/Test_Moth.png/65px-Test_Moth.png?bb"></a><br><a><span>Test Moth</span></a></td>
<td>A made-up moth.</td>
<td><b>Common</b></td>
<td></td>
<td></td>
<td>Flying</td>
<td></td>
</tr>
</table>
</div>`;

describe("bugs", () => {
    it("parses locations, times, behavior and the quests and bundles that need a bug", () => {
        const rows = parseBugTable(bugHtml, "https://palia.wiki.gg");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            name: "Test Mantis",
            rarity: 2,
            locations: ["Kilima Fields", "Steps of Renova"],
            behavior: "Jumping",
            neededFor: ["Quest: Test Quest", "Bundle: Test Bundle"],
            imageUrl: "https://palia.wiki.gg/images/Test_Mantis.png",
        });
        expect(rows[1]).toMatchObject({ name: "Test Moth", locations: [], time: "", neededFor: [] });
    });

    it("builds behavior categories with the fish counters and variants", () => {
        const { template, imageUrls } = buildBugTemplate(parseBugTable(bugHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual(["Flying", "Jumping"]);
        expect(template.variantDefs.map(v => v.key)).toEqual(["normal", "starred"]);
        expect(template.counterDefs.map(c => c.key)).toEqual(["inventory", "placed", "total", "target"]);
        expect(template.items[0].tags).toEqual([
            "Location: Kilima Fields",
            "Location: Steps of Renova",
            "Time: Evening",
            "Time: Night",
            "Behavior: Jumping",
            "Quest: Test Quest",
            "Bundle: Test Bundle",
        ]);
        // A blank time cell gives no time tags rather than "Any time".
        expect(template.items[1].tags).toEqual(["Behavior: Flying"]);
        expect(imageUrls.size).toBe(2);
    });

    it("fails clearly when the table is missing", () => {
        expect(() => parseBugTable("<p>nothing</p>")).toThrow("List of Bugs");
    });
});

/** A made-up item page with a portable infobox, like the wiki's item pages. */
const itemPage = (fields: string, quote: string) => `
<div class="mw-parser-output">
<aside class="portable-infobox">
<h2 class="pi-title">Item</h2>
<figure class="pi-image"><a href="/wiki/File:Item.png"><img src="/images/Test_Item.png?abc" alt="Item.png"></a></figure>
${fields}
</aside>
<h2><span class="mw-headline" id="Description">Description</span></h2>
<p><style>.cquote{}</style></p><table class="cquote"><tr><td class="cquote-quote">${quote}</td></tr></table>
</div>`;

const field = (key: string, value: string) =>
    `<div class="pi-item pi-data" data-source="${key}"><h3 class="pi-data-label">${key}</h3><div class="pi-data-value">${value}</div></div>`;

const ticket = (amount: string) =>
    `<span class="template-cost template-cost-maji-market-ticket" data-sort-value="${amount}"><span><a href="/wiki/Maji_Market_Ticket" title="Maji Market Ticket"><img src="/x.png"></a> <b>${amount}</b></span></span>`;

const envelope = (amount: string) =>
    `<span class="template-cost template-cost-lucky-envelope"><span><a href="/wiki/Lucky_Envelope" title="Lucky Envelope"><img src="/y.png"></a> <b>${amount}</b></span></span>`;

const testPillowHtml = itemPage(
    field("category", "<a>Decor</a>") +
        field("rarity", "<font class='template-rarity'><b>Uncommon</b></font>") +
        field("event", "<a>Maji Market</a><br><a>Luna New Year</a>") +
        field(
            "obtain",
            `<a href="/wiki/Test_Stall"><span>Test Stall</span></a><br>&#160;&#160;• ${ticket("1,000")}<br>` +
                `<a href="/wiki/Prize_Booth"><span>Prize Booth</span></a><br>&#160;&#160;• ${envelope("900")}<br>` +
                `<a href="/wiki/Trading"><span>Trading</span></a><br>`
        ) +
        field("recipeobtain", "Cannot be crafted."),
    "A made-up pillow."
);

const testDishHtml = itemPage(
    field("category", "<a>Consumable</a>") +
        field("group", "<a>Dishes</a>") +
        field("rarity", "<b>Epic</b>") +
        field("obtain", `<a href="/wiki/Cooking"><span>Cooking</span></a><br>`) +
        field(
            "recipeobtain",
            `<a href="/wiki/Test_Stall"><span>Test Stall</span></a><br>&#160;&#160;• <span class="template-cost template-cost-gold"><span><a title="Gold"></a> <b>1</b></span></span><br>`
        ),
    "A made-up dish."
);

describe("Maji Market", () => {
    it("reads an item page's infobox, sources with their currencies, and description", () => {
        const item = parseWikiItemPage("Test Pillow", testPillowHtml, "https://palia.wiki.gg");
        expect(item).toMatchObject({
            name: "Test Pillow",
            description: "A made-up pillow.",
            category: "Decor",
            group: "",
            rarity: 2,
            events: ["Maji Market", "Luna New Year"],
            imageUrl: "https://palia.wiki.gg/images/Test_Item.png",
        });
        expect(item.obtain).toEqual([
            { source: "Test Stall", costs: ["1,000 Maji Market Ticket"] },
            { source: "Prize Booth", costs: ["900 Lucky Envelope"] },
            { source: "Trading", costs: [] },
        ]);
    });

    it("builds shop categories with Inventory, Placed, Total and Target", () => {
        const items = [parseWikiItemPage("Test Pillow", testPillowHtml), parseWikiItemPage("Test Dish", testDishHtml)];
        const { template, imageUrls } = buildMajiMarketTemplate(items, meta, [
            "Prize Booth",
            "Test Stall",
            "Empty Stall",
        ]);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        // An item goes under its first shop; shops without items are left out.
        expect(template.categories.map(c => c.name)).toEqual(["Test Stall"]);
        expect(template.variantDefs).toEqual([]);
        expect(template.counterDefs.map(c => c.key)).toEqual(["inventory", "placed", "total", "target"]);
        expect(template.counterDefs.find(c => c.key === "total")?.sumOf).toEqual(["inventory", "placed"]);

        const [pillow, dish] = template.items;
        expect(template.categories.find(c => c.id === pillow.categoryId)?.name).toBe("Test Stall");
        expect(pillow.tags).toEqual(["Shop: Test Stall", "Shop: Prize Booth", "Type: Decor", "Event: Luna New Year"]);
        expect(pillow.description).toBe(
            "A made-up pillow.\nTest Stall • 1,000 Maji Market Ticket\nPrize Booth • 900 Lucky Envelope"
        );
        // Bought as a recipe: no placeholder price.
        expect(dish.tags).toEqual(["Shop: Test Stall", "Type: Recipe"]);
        expect(dish.description).toBe("A made-up dish.\nRecipe sold at Test Stall");
        expect(dish.attributes.rarity).toBe(4);
        expect(imageUrls.size).toBe(2);
    });

    it("fails clearly for a page without an infobox", () => {
        expect(() => parseWikiItemPage("Nothing", "<p>nothing</p>")).toThrow("no infobox");
    });
});
