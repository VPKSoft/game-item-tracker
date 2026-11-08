import { describe, expect, it } from "vitest";
import { getVariantCounters } from "../src/Domain/Counters.ts";
import { validateTemplate } from "../src/Domain/Validation.ts";
import { templateSchema } from "../src/Schemas/TemplateSchema.ts";
import {
    buildFishTemplate,
    buildPlushieTemplate,
    fullImageUrl,
    parseBait,
    parseFishTable,
    parsePlushieTables,
    parseTimes,
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
            neededFor: ["quest:Daily Quest", "bundle:Flamerod Bundle"],
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
        expect(template.items[0].tags).toEqual(
            expect.arrayContaining(["location:Caves", "time:Morning", "bait:Worm", "bundle:Flamerod Bundle"])
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
            expect.arrayContaining(["source:Bug Catching", "source:Lantern Night", "tradeable", "Test Bee"])
        );
        expect(conflicts).toHaveLength(1);
        const lantern = template.categories.find(c => c.name === "Lantern Night");
        const market = template.categories.find(c => c.id === lantern?.parentId);
        expect(market?.name).toBe("Maji Market");
        // Placeholder "Unknown" images are not downloaded.
        expect(imageUrls.has("lantern-plush")).toBe(false);
        expect(template.counterDefs.find(c => c.key === "total")?.sumOf).toEqual(["inventory", "placed", "storage"]);
    });
});
