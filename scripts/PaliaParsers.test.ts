import { describe, expect, it } from "vitest";
import { getCounterMax, getCounterValue, getMissing, getVariantCounters } from "../src/Domain/Counters.ts";
import { validateTemplate } from "../src/Domain/Validation.ts";
import { templateSchema } from "../src/Schemas/TemplateSchema.ts";
import {
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
    findGuildLink,
    fullImageUrl,
    isPaidWithMedals,
    parseArtifactBundles,
    parseBait,
    parseBugTable,
    parseBundleTables,
    parseFishTable,
    parseGuildStoreItems,
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

/** One row of a bundle table: the item box with the "xN" amount, and the "How to Obtain" cell. */
const bundleRow = (name: string, amount: string, source: string, text: string, starred = false) => `
<tr data-checklist-id="${name}">
<td><center><style>.mw-parser-output .template-itembox{max-width:100%}</style><div class="template-itembox">
<div><div class="frame"><i class="template-itembox-rel"><a href="/wiki/${name.replace(/ /g, "_")}" title="${name}"><img alt="${name}" src="/images/thumb/${name.replace(/ /g, "_")}.png/80px-${name.replace(/ /g, "_")}.png?aa"></a>${starred ? '<img alt="SQ.png" src="/images/thumb/SQ.png/28px-SQ.png?bb" class="quality">' : ""}</i>
</div><p class="number">${amount}</p></div>
<div class="caption"><b><a href="/wiki/${name.replace(/ /g, "_")}"><span>${name}</span></a></b></div>
</div></center></td>
<td><big><big><a href="/wiki/Skill">${source}</a></big></big><hr /><p>${text}</p></td>
</tr>`;

const bundleHtml = `
<div class="mw-parser-output">
<h2><span class="mw-headline" id="Tips">Tips and Tricks</span></h2>
<h2><span class="mw-headline" id="Vault_of_the_Waves">Vault of the Waves <img alt="Waves.png" src="/images/Waves.png"></span><span class="mw-editsection">[<a>edit</a>]</span></h2>
<h3><span class="mw-headline" id="Test_Bundle">Test Bundle</span><span class="mw-editsection">[<a>edit</a>]</span></h3>
<div class="tablescroll"><table class="paliatable" data-checklist-id="Test Bundle">
<tr><th>Items</th><th>How to Obtain</th></tr>
${bundleRow("Sample Snail", "x1", "Bug Catching", "Found on the beach.")}
${bundleRow("Example Bar", "x20", "Mining &amp; Refining", "Smelt the ore.")}
<tr data-checklist-id="Reward"><th>Reward</th><td><ul><li><span data-item="Gold" class="template-item"><b>100</b></span> Gold</li></ul></td></tr>
</table></div>
<h3><span class="mw-headline" id="Vault_Reward">Vault Reward</span></h3>
<ul><li>Not an item</li></ul>
<h2><span class="mw-headline" id="Vault_of_the_Roots">Vault of the Roots</span></h2>
<h3><span class="mw-headline" id="Other_Bundle">Seeker's Bundle</span></h3>
<table class="paliatable"><tr><th>Items</th><th>How to Obtain</th></tr>
${bundleRow("Sample Snail", "x2", "Bug Catching + Foraging", "Again.", true)}
</table>
<h2><span class="mw-headline" id="Update_History">Update History</span></h2>
<table class="paliatable"><tr><th>Items</th><th>How to Obtain</th></tr>${bundleRow("Not Counted", "x1", "Nothing", "")}</table>
</div>`;

describe("bundles", () => {
    it("parses the bundle tables with vaults, amounts and sources", () => {
        const rows = parseBundleTables(bundleHtml, "https://palia.wiki.gg");
        expect(rows.map(r => [r.vault, r.bundle, r.name, r.amount, r.sources])).toEqual([
            ["Vault of the Waves", "Test Bundle", "Sample Snail", 1, ["Bug Catching"]],
            ["Vault of the Waves", "Test Bundle", "Example Bar", 20, ["Mining", "Refining"]],
            ["Vault of the Roots", "Seeker's Bundle", "Sample Snail", 2, ["Bug Catching", "Foraging"]],
        ]);
        expect(rows[0].description).toBe("Found on the beach.");
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Sample_Snail.png");
        // The SQ.png star icon marks a star quality item; it is not taken as the item image.
        expect(rows.map(r => r.starred)).toEqual([false, false, true]);
        expect(rows[2].imageUrl).toBe("https://palia.wiki.gg/images/Sample_Snail.png");
    });

    it("builds vault and bundle categories with a read-only target from the bundle amount", () => {
        const { template, imageUrls } = buildBundleTemplate(parseBundleTables(bundleHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => [c.id, c.parentId, c.order])).toEqual([
            ["vault-of-the-waves", undefined, 0],
            ["test-bundle", "vault-of-the-waves", 0],
            ["vault-of-the-roots", undefined, 1],
            ["seekers-bundle", "vault-of-the-roots", 0],
        ]);
        expect(template.items.map(i => [i.id, i.categoryId, i.defaults])).toEqual([
            ["sample-snail", "test-bundle", { target: 1 }],
            ["example-bar", "test-bundle", { target: 20 }],
            ["sample-snail-seekers-bundle", "seekers-bundle", { target: 2 }],
        ]);
        expect(template.items[1].tags).toEqual([
            "Vault: Vault of the Waves",
            "Bundle: Test Bundle",
            "Source: Mining",
            "Source: Refining",
        ]);
        // The starred item keeps the id of the plain name, so saves of 1.0.0 keep their counts.
        expect(template.items.map(i => i.name)).toEqual(["Sample Snail", "Example Bar", "Sample Snail ★"]);
        expect(template.items[2].tags).toEqual([
            "Vault: Vault of the Roots",
            "Bundle: Seeker's Bundle",
            "Source: Bug Catching",
            "Source: Foraging",
            "Quality: Star",
        ]);
        expect(template.counterDefs).toEqual([
            { key: "placed", label: "Placed", kind: "manual", maxFrom: "target", order: 0 },
            { key: "total", label: "Total", kind: "computed", sumOf: ["placed"], role: "owned", order: 1 },
            { key: "target", label: "Target", kind: "manual", role: "target", readOnly: true, order: 2 },
        ]);
        expect(template.attributeDefs).toEqual([]);
        expect(imageUrls.get("sample-snail-seekers-bundle")).toBe("https://palia.wiki.gg/images/Sample_Snail.png");
    });
});

/** One artifact row: the item box (no amount) and the description cell. */
const artifactRow = (name: string, text: string) => `
<tr data-checklist-id="${name}">
<td><center><div class="template-itembox"><div><div class="frame"><i class="template-itembox-rel"><a href="/wiki/${name.replace(/ /g, "_")}"><img alt="${name}" src="/images/thumb/${name.replace(/ /g, "_")}.png/80px-${name.replace(/ /g, "_")}.png?aa"></a></i></div></div>
<div class="caption"><b><a><span>${name}</span></a></b></div></div></center></td>
<td>${text}<br><br>An artifact from the test.</td>
</tr>`;

const artifactHtml = `
<div class="mw-parser-output">
<h2><span class="mw-headline">Contents</span></h2>
<h2><span class="mw-headline">Sample Hills Artifacts</span></h2>
<h3><span class="mw-headline">Tester's Bundle</span><span class="mw-editsection">[<a>edit</a>]</span></h3>
<h4><span class="mw-headline">Tester's Device</span></h4>
<table class="paliatable" data-checklist-id="Tester's Device Bundle"><tr><th>Items</th><th>Description</th><th>Reward</th></tr>
${artifactRow("Tester's Device 1", "A device.")}
${artifactRow("Tester's Device 2", "Another part.")}
<tr data-checklist-id="Reward"><th>Reward</th><td>6 Certificates of Merit</td></tr>
</table>
<h4><span class="mw-headline">Tester's Device</span></h4>
<table class="paliatable" data-checklist-id="Tester's Device Bundle"><tr><th>Items</th><th>Description</th></tr>
${artifactRow("Tester's Glass 1", "A glass.")}
</table>
<h2><span class="mw-headline">Example Woods Artifacts</span></h2>
<h3><span class="mw-headline">Old Collection</span></h3>
<h4><span class="mw-headline">Old Toy</span></h4>
<table class="paliatable"><tr><th>Items</th><th>Description</th></tr>${artifactRow("Old Toy", "A toy.")}</table>
<h2><span class="mw-headline">Gallery</span></h2>
<table class="paliatable"><tr><th>Items</th></tr>${artifactRow("Not Counted", "")}</table>
</div>`;

describe("artifact bundles", () => {
    it("names each artifact after its pieces, not the repeated heading or table id", () => {
        const rows = parseArtifactBundles(artifactHtml, "https://palia.wiki.gg");
        expect(rows.map(r => [r.region, r.collection, r.artifact, r.name])).toEqual([
            ["Sample Hills", "Tester's Bundle", "Tester's Device", "Tester's Device 1"],
            ["Sample Hills", "Tester's Bundle", "Tester's Device", "Tester's Device 2"],
            ["Sample Hills", "Tester's Bundle", "Tester's Glass", "Tester's Glass 1"],
            ["Example Woods", "Old Collection", "Old Toy", "Old Toy"],
        ]);
        expect(rows[0].description).toBe("A device.\nAn artifact from the test.");
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Tester's_Device_1.png");
    });

    it("builds collection and artifact categories with Placed (max 1), Storage and a read-only target of 1", () => {
        const rows = parseArtifactBundles(artifactHtml).filter(r => r.region === "Sample Hills");
        const { template, imageUrls } = buildArtifactBundleTemplate(rows, meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => [c.id, c.parentId, c.order])).toEqual([
            ["testers-bundle", undefined, 0],
            ["testers-device", "testers-bundle", 0],
            ["testers-glass", "testers-bundle", 1],
        ]);
        expect(template.items.map(i => [i.id, i.categoryId, i.defaults, i.tags])).toEqual([
            ["testers-device-1", "testers-device", { target: 1 }, ["Collection: Tester's Bundle"]],
            ["testers-device-2", "testers-device", { target: 1 }, ["Collection: Tester's Bundle"]],
            ["testers-glass-1", "testers-glass", { target: 1 }, ["Collection: Tester's Bundle"]],
        ]);
        expect(template.counterDefs).toEqual([
            { key: "placed", label: "Placed", kind: "manual", max: 1, role: "owned", order: 0 },
            { key: "storage", label: "Storage", kind: "manual", order: 1 },
            { key: "total", label: "Total", kind: "computed", sumOf: ["storage"], order: 2 },
            { key: "target", label: "Target", kind: "manual", role: "target", readOnly: true, order: 3 },
        ]);
        expect(imageUrls.size).toBe(3);
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

const stickerRow = (name: string, third: string) =>
    `<tr><td><img alt="${name}.png" src="/images/thumb/${name.replace(/ /g, "_")}.png/65px-x.png?aa"></td><td><a><span>${name}</span></a></td><td>${third}</td></tr>`;

const stickerHtml = `
<div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2>Stickers</h2></div>
<div class="mw-heading mw-heading3"><h3>Default Stickers</h3></div>
<table class="paliatable"><tr><th>Image</th><th>Name</th><th>Chat Message</th></tr>
${stickerRow("Test Wave Sticker", "Hello there!")}
</table>
<div class="mw-heading mw-heading3"><h3>Series 1 Stickers</h3></div>
<table class="paliatable"><tr><th>Image</th><th>Name</th><th>Rarity</th></tr>
${stickerRow("Test Chapaa Sticker", "<style>.x{}</style><font class='template-rarity'><b>Uncommon</b></font>")}
</table>
<div class="mw-heading mw-heading3"><h3>Premium Stickers</h3></div>
<table class="paliatable"><tr><th>Image</th><th>Name</th><th>Cost</th></tr>
${stickerRow("Test Coin Sticker", "<span class='template-cost'><span><a title='Palia Coin'><img src='/c.png'></a> <b>100</b> <a>Palia Coins</a></span></span>")}
</table>
<table class="paliatable"><tr><th>Image</th><th>Name</th><th>Description</th><th>Rarity</th></tr><tr><td></td><td>Not a sticker</td><td></td><td></td></tr></table>
</div>`;

describe("stickers", () => {
    it("parses every sticker table with its section and third column", () => {
        const rows = parseStickerTables(stickerHtml, "https://palia.wiki.gg");
        expect(rows.map(r => [r.name, r.section, r.rarity, r.detail])).toEqual([
            ["Test Wave Sticker", "Default Stickers", undefined, "Chat message: Hello there!"],
            ["Test Chapaa Sticker", "Series 1 Stickers", 2, ""],
            ["Test Coin Sticker", "Premium Stickers", undefined, "Cost: 100 Palia Coins"],
        ]);
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Test_Wave_Sticker.png");
    });

    it("builds section categories with Amount, Total = Amount and Target", () => {
        const { template, imageUrls } = buildStickerTemplate(parseStickerTables(stickerHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual([
            "Default Stickers",
            "Series 1 Stickers",
            "Premium Stickers",
        ]);
        expect(template.variantDefs).toEqual([]);
        expect(template.counterDefs.map(c => c.key)).toEqual(["amount", "total", "target"]);
        expect(template.counterDefs.find(c => c.key === "total")).toMatchObject({ sumOf: ["amount"], role: "owned" });
        expect(template.items.map(i => i.description)).toEqual([
            "Chat message: Hello there!",
            "",
            "Cost: 100 Palia Coins",
        ]);
        expect(imageUrls.size).toBe(3);
    });

    it("gives Default stickers no counters and Premium stickers a single amount with a hidden total and target", () => {
        const { template } = buildStickerTemplate(parseStickerTables(stickerHtml), meta);
        expect(template.categories.map(c => c.counterProfile)).toEqual(["none", undefined, "single"]);
        const [wave, chapaa, coin] = template.items;
        const amount = template.counterDefs[0];
        const owned = { counts: { _: { amount: 1 } }, notes: "", removedTags: [], customTags: [] };

        expect(getVariantCounters(template, "_", wave)).toEqual([]);
        expect(getMissing(template, wave, owned)).toBeUndefined();

        expect(getVariantCounters(template, "_", chapaa).map(c => c.key)).toEqual(["amount", "total", "target"]);
        expect(getCounterMax(template, amount, chapaa)).toBeUndefined();

        expect(getVariantCounters(template, "_", coin).map(c => c.key)).toEqual(["amount"]);
        expect(getCounterMax(template, amount, coin)).toBe(1);
        expect(getCounterValue(template, undefined, "_", "target", coin)).toBe(1);
        expect(getMissing(template, coin, undefined)).toBe(1);
        expect(getMissing(template, coin, owned)).toBe(0);
    });
});

const prizeHtml = (bag: string, extra = "") =>
    itemPage(
        field("category", "<a>Decor</a>") +
            field("rarity", "<b>Rare</b>") +
            field(
                "obtain",
                `${extra}<a href="/wiki/Zeki%27s_Prize_Wheel"><span>Zeki's Prize Wheel</span></a><br>&#160;&#160;• ${bag}<br><a><span>Trading</span></a><br>`
            ),
        "A made-up prize."
    );

describe("Zeki's Prize Wheel", () => {
    it("builds one category per prize bag with Inventory, Placed, Total and Target", () => {
        const items = [
            parseWikiItemPage("Test Plush", prizeHtml("Plushie Prize Bag")),
            parseWikiItemPage(
                "Test Garlic",
                prizeHtml("Ingredients Prize Bag", "<a><span>General Store</span></a><br>&#160;&#160;• 46 Gold<br>")
            ),
            parseWikiItemPage("Test Poster", prizeHtml("Decor Prize Bag")),
        ];
        const { template, imageUrls } = buildPrizeWheelTemplate(items, meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual([
            "Decor Prize Bag",
            "Ingredients Prize Bag",
            "Plushie Prize Bag",
        ]);
        const garlic = template.items.find(i => i.name === "Test Garlic");
        expect(template.categories.find(c => c.id === garlic?.categoryId)?.name).toBe("Ingredients Prize Bag");
        expect(garlic).toMatchObject({
            description: "A made-up prize.",
            attributes: { rarity: 3 },
            tags: ["Type: Decor"],
        });
        expect(template.counterDefs.map(c => c.key)).toEqual(["inventory", "placed", "total", "target"]);
        expect(imageUrls.size).toBe(3);
    });
});

const medal = (amount: string) =>
    `<span class="template-cost template-cost-bug-catching"><span><a title="Test Medal"><img src="/m.png"></a> <b>${amount}</b></span></span>`;

const gold = (amount: string) =>
    `<span class="template-cost template-cost-gold"><span><a title="Gold"><img src="/g.png"></a> <b>${amount}</b> <a title="Gold">Gold</a></span></span>`;

const guildItemHtml = (sources: string) =>
    itemPage(
        field("category", "<a>Decor</a>") + field("rarity", "<b>Rare</b>") + field("obtain", sources),
        "A made-up item."
    );

describe("guild store exclusives", () => {
    it("reads the skills, the guild link and the non-recipe store items with their prices", () => {
        const weekly = `<div class="mw-parser-output"><h2>Weekly Challenges By Skill</h2>
<h3><a href="/wiki/Test_Catching" title="Test Catching">Test Catching</a></h3><table></table>
<h3><a href="/wiki/Home_Tours" title="Home Tours">Home Tours</a></h3></div>`;
        expect(parseWeeklyChallengeSkills(weekly)).toEqual(["Test Catching", "Home Tours"]);

        const skill = `<p><a title="Guild Store Decor">x</a> <a title="Test Catching Guild">Test Catching Guild</a></p>`;
        expect(findGuildLink("Test Catching", skill)).toBe("Test Catching Guild");
        expect(findGuildLink("Home Tours", "<p><a title='Housing Plot'>x</a></p>")).toBeUndefined();

        // The recipe rows run the words together ("Test FarmRecipe"), as on the wiki.
        const store = `<table class="paliatable"><tr><th>Item</th><th>Cost</th><th>Skill Level</th></tr>
<tr><td><table data-item="Test Farm" class="template-item"><tr><td><a title="Test Farm">Test Farm</a></td><td><b>Recipe</b></td></tr></table></td><td>${gold("500")}</td><td>2</td></tr>
<tr><td><table data-item="Test Net" class="template-item"><tr><td><a title="Test Net">Test Net</a></td></tr></table>x20</td><td>${medal("4")}</td><td>10</td></tr>
<tr><td><a href="/wiki/Test_Plaque" title="Test Plaque">Test Plaque</a></td><td>${medal("140")}</td><td>10</td></tr>
<tr><td><table data-item="Test Pet (Ranching)" class="template-item"><tr><td><a title="Test Pet (Ranching)">Test Pet</a></td></tr></table></td><td>${gold("2,500")}</td><td>2</td></tr>
</table>`;
        const entries = parseGuildStoreItems(store);
        expect(entries).toEqual([
            { name: "Test Net", cost: "4 Test Medal for 20", currencies: ["Test Medal"] },
            { name: "Test Plaque", cost: "140 Test Medal", currencies: ["Test Medal"] },
            { name: "Test Pet (Ranching)", cost: "2,500 Gold", currencies: ["Gold"] },
        ]);
        expect(entries.map(isPaidWithMedals)).toEqual([true, true, false]);
        expect(parseGuildStoreItems("<p>no store</p>")).toEqual([]);
    });

    it("keeps the medal-priced items the guild is the only source of", () => {
        const guild = `<a><span>Test Guild</span></a><br>&#160;&#160;• ${medal("140")}<br>`;
        const entry = (name: string, cost: string, currency: string) => ({ name, cost, currencies: [currency] });
        const stores = [
            {
                guild: "Test Guild",
                entries: [
                    {
                        entry: entry("Test Plaque", "140 Test Medal", "Test Medal"),
                        item: parseWikiItemPage("Test Plaque", guildItemHtml(guild)),
                    },
                    {
                        entry: entry("Test Pet (Bug)", "40 Test Medal", "Test Medal"),
                        item: parseWikiItemPage("Test Pet (Bug)", guildItemHtml(guild)),
                    },
                    {
                        entry: entry("Test Cow", "2,500 Gold", "Gold"),
                        item: parseWikiItemPage("Test Cow", guildItemHtml(guild)),
                    },
                    {
                        entry: entry("Test Net", "4 Test Medal", "Test Medal"),
                        item: parseWikiItemPage(
                            "Test Net",
                            guildItemHtml(`${guild}<a><span>General Store</span></a><br>`)
                        ),
                    },
                    {
                        entry: entry("Test Fertilizer", "5 Test Medal", "Test Medal"),
                        item: parseWikiItemPage("Test Fertilizer", guildItemHtml("")),
                    },
                ],
            },
            {
                guild: "Empty Guild",
                entries: [
                    {
                        entry: entry("Test Rug", "9 Test Medal", "Test Medal"),
                        item: parseWikiItemPage("Test Rug", guildItemHtml(guild)),
                    },
                ],
            },
        ];
        const { template, imageUrls } = buildGuildExclusivesTemplate(stores, meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        // Empty Guild's only item comes from another guild, so the category is left out.
        expect(template.categories.map(c => c.name)).toEqual(["Test Guild"]);
        // Test Cow costs Gold, Test Net has another source and Test Fertilizer has none.
        expect(template.items.map(i => i.name)).toEqual(["Test Plaque", "Test Pet"]);
        expect(template.items[1]).toMatchObject({
            description: "A made-up item.\nTest Guild • 40 Test Medal",
            attributes: { rarity: 3 },
            tags: ["Type: Decor"],
        });
        expect(template.counterDefs.map(c => c.key)).toEqual(["inventory", "placed", "total", "target"]);
        expect(imageUrls.size).toBe(2);
    });
});

const rewardItem = (name: string) =>
    `<li><span data-item="${name}" class="template-item"><i><a title="${name}"><img src="/x.png"></a></i></span> <a title="${name}">${name}</a></li>`;

const luckyBoxHtml = `
<div class="mw-parser-output">
<h2><span class="mw-headline" id="Uses">Uses</span></h2>
<ul>${rewardItem("Not A Reward")}</ul>
<h2><span class="mw-headline" id="Possible_Rewards">Possible Rewards</span></h2>
<h3><span class="mw-headline" id="Decor"><span class="mw-customcollapsible-1"></span> Decor</span></h3>
<div class="mw-collapsible"><div class="template-cols-list-2"><ul>${rewardItem("Test Plush")}${rewardItem("Test Lamp")}</ul></div></div>
<h3><span class="mw-headline" id="Equipment">Equipment</span><span class="mw-editsection">[edit]</span></h3>
<div class="mw-collapsible"><ul>${rewardItem("Test Arrow")}</ul></div>
<h2><span class="mw-headline" id="Notes">Notes</span></h2>
<ul>${rewardItem("Also Not A Reward")}</ul>
</div>`;

describe("Zeki's Wondrous Machine", () => {
    it("reads the Lucky Box rewards by section", () => {
        expect(parseLuckyBoxRewards(luckyBoxHtml)).toEqual([
            { name: "Test Plush", section: "Decor" },
            { name: "Test Lamp", section: "Decor" },
            { name: "Test Arrow", section: "Equipment" },
        ]);
        // The Super Lucky Prize page lists its rewards without headings.
        const superLucky = `<div class="mw-parser-output"><h2><span class="mw-headline">Possible Rewards</span></h2>
<ul>${rewardItem("Test Vase")}${rewardItem("Test Plush")}</ul><h2>Trivia</h2></div>`;
        expect(parseLuckyBoxRewards(superLucky)).toEqual([
            { name: "Test Vase", section: "Other" },
            { name: "Test Plush", section: "Other" },
        ]);
    });

    it("builds one category per reward section with Inventory, Placed, Total and Target", () => {
        const machine = `<a><span>Zeki's Wondrous Machine</span></a><br>&#160;&#160;• Chance Prize<br>`;
        const sources: Record<string, string> = {
            "Test Plush": machine,
            "Test Lamp": `${machine}<a><span>General Store</span></a><br>`,
            "Test Arrow": "",
            "Test Vase": machine,
            "Test Bowl": `${machine}<a><span>Super Lucky Prize</span></a><br>`,
        };
        const page = (name: string) =>
            itemPage(
                field("category", "<a>Decor</a>") +
                    (name === "Test Arrow" ? field("group", "<a>Arrow</a>") : "") +
                    field("rarity", "<b>Rare</b>") +
                    (sources[name] ? field("obtain", sources[name]) : ""),
                "A made-up prize."
            );
        const rewards = [
            ...parseLuckyBoxRewards(luckyBoxHtml),
            { name: "Test Vase", section: "Decor" },
            { name: "Test Bowl", section: "Decor" },
        ].map(reward => ({
            reward,
            item: parseWikiItemPage(reward.name, page(reward.name)),
        }));
        // Test Vase is on the Super Lucky Prize page; Test Bowl names it in its own "Obtained From".
        const { template, imageUrls } = buildWondrousMachineTemplate(rewards, meta, ["Test Vase"]);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual(["Decor", "Equipment"]);
        // Only Test Plush comes from the machine alone; Test Arrow lists no source at all.
        expect(template.items.map(i => [i.name, i.tags])).toEqual([
            ["Test Plush", ["Wondrous Machine", "Unique to Wondrous Machine"]],
            ["Test Lamp", ["Wondrous Machine"]],
            ["Test Arrow", ["Type: Arrow", "Wondrous Machine"]],
            ["Test Vase", ["Wondrous Machine", "Super Lucky Prize"]],
            ["Test Bowl", ["Wondrous Machine", "Super Lucky Prize"]],
        ]);
        expect(template.items[0]).toMatchObject({ description: "A made-up prize.", attributes: { rarity: 3 } });
        expect(template.counterDefs.map(c => c.key)).toEqual(["inventory", "placed", "total", "target"]);
        expect(imageUrls.size).toBe(5);
    });
});

/** One ingredient list entry of the Tints page: the item icon with the amount in bold, then the item link. */
const tintIngredient = (name: string, amount: number) =>
    `<li><span data-item="${name}" class="template-item"><i class="template-item-rel"><a href="/wiki/${name.replace(/ /g, "_")}"><img alt="${name}" src="/images/thumb/${name.replace(/ /g, "_")}.png/28px-${name.replace(/ /g, "_")}.png?a1"></a></i><b>${amount}</b></span> <a>${name}</a></li>`;

const tintRow = (name: string, ingredients: [string, number][], colors: string[]) => `
<tr>
<td><img alt="${name}.png" src="/images/thumb/${name.replace(/ /g, "_")}.png/100px-${name.replace(/ /g, "_")}.png?b2"></td>
<td><a href="/wiki/${name.replace(/ /g, "_")}"><span>${name}</span></a></td>
<td><ul>${ingredients.map(([n, a]) => tintIngredient(n, a)).join("")}</ul></td>
<td><style>.x{}</style>${colors.map(c => `<span class="template-hex"><span class="template-hex-color"></span><span>${c}</span></span><br>`).join("")}</td>
</tr>`;

const tintHtml = `
<div class="mw-parser-output">
<table class="paliatable sortable"><tbody>
<tr><th>Image</th><th>Name</th><th>Ingredients</th><th>Colors</th></tr>
${tintRow(
    "Slate Tint",
    [
        ["Flint", 12],
        ["Kilima Night Moth", 5],
    ],
    ["#969088", "#caad93"]
)}
${tintRow("Amaranth Tint", [["Elderwood Lotus", 3]], ["#8B5273"])}
${tintRow(
    "Classic Tint",
    [
        ["Coral", 4],
        ["Flint", 2],
    ],
    []
)}
</tbody></table>
<table class="paliatable"><tr><th>Name</th><th>Other</th></tr><tr><td>x</td><td>y</td></tr></table>
</div>`;

describe("tints", () => {
    it("reads each tint's ingredients with amounts and images, and its colors", () => {
        const rows = parseTints(tintHtml, "https://palia.wiki.gg");
        expect(rows.map(r => r.name)).toEqual(["Slate Tint", "Amaranth Tint", "Classic Tint"]);
        expect(rows[0].ingredients).toEqual([
            { name: "Flint", amount: 12, imageUrl: "https://palia.wiki.gg/images/Flint.png" },
            {
                name: "Kilima Night Moth",
                amount: 5,
                imageUrl: "https://palia.wiki.gg/images/Kilima_Night_Moth.png",
            },
        ]);
        expect(rows[0].colors).toEqual(["#969088", "#CAAD93"]);
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Slate_Tint.png");
    });

    it("builds materials sorted by name, item materials, Acquired and a planned counter that requires it", () => {
        const { template, imageUrls } = buildTintTemplate(parseTints(tintHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.materials?.map(m => [m.id, m.name, m.order])).toEqual([
            ["coral", "Coral", 0],
            ["elderwood-lotus", "Elderwood Lotus", 1],
            ["flint", "Flint", 2],
            ["kilima-night-moth", "Kilima Night Moth", 3],
        ]);
        expect(template.items.map(i => [i.id, i.materials, i.description])).toEqual([
            ["slate-tint", { flint: 12, "kilima-night-moth": 5 }, "Colors: #969088, #CAAD93"],
            ["amaranth-tint", { "elderwood-lotus": 3 }, "Colors: #8B5273"],
            ["classic-tint", { coral: 4, flint: 2 }, ""],
        ]);
        expect(template.items[0].tags).toEqual(["Ingredient: Flint", "Ingredient: Kilima Night Moth"]);
        expect(template.counterDefs.map(c => [c.key, c.role, c.max, c.requires])).toEqual([
            ["acquired", undefined, 1, undefined],
            ["inventory", "owned", undefined, undefined],
            ["to-craft", "planned", undefined, "acquired"],
        ]);
        expect(imageUrls.get("material:flint")).toBe("https://palia.wiki.gg/images/Flint.png");
        expect(imageUrls.get("slate-tint")).toBe("https://palia.wiki.gg/images/Slate_Tint.png");
        expect(imageUrls.size).toBe(7);
    });
});

/** The infobox and quotes of a recipe page, with a flavor quote before the in-game description. */
const recipePageHtml = (name: string, ingredients: string) => `
<div class="mw-parser-output">
<aside class="portable-infobox"><h2 class="pi-title">${name}</h2>
<figure class="pi-image"><a><img src="/images/${name.replace(/ /g, "_")}.png?23a78d"></a></figure>
<div class="pi-data" data-source="rarity"><h3>Rarity</h3><div class="pi-data-value">Rare</div></div>
<div class="pi-data" data-source="crafter"><h3>Starting</h3><div class="pi-data-value"><center><a href="/wiki/Standard_Stove"><span>Standard Stove</span></a><br><img src="/images/thumb/Standard_Stove.png/40px-Standard_Stove.png"></center></div></div>
<div class="pi-data" data-source="ingredients"><div class="pi-data-value"><ul>${ingredients}</ul></div></div>
</aside>
<table class="cquote"><tr><td class="cquote-quote">A family recipe.</td></tr><tr><td class="cquote-cite"><cite>–The Palia Diet</cite></td></tr></table>
<table class="cquote"><tr><td class="cquote-quote">A basic fish stock.</td></tr><tr><td class="cquote-cite"><cite>–In-Game Item Description</cite></td></tr></table>
</div>`;

/** An ingredient whose `data-item` is a link target, as for "Any Fish". */
const anyIngredient = (label: string, target: string, image: string, amount: number) =>
    `<li><span data-item="${target}" class="template-item"><i class="template-item-rel"><a href="/wiki/${target}"><img alt="${label}" src="/images/thumb/${image}.png/28px-${image}.png?1"></a></i><b>${amount}</b></span> <a href="/wiki/${target}">${label}</a></li>`;

describe("food recipes", () => {
    it("reads the in-game description, rarity, station and ingredients of a recipe page", () => {
        const row = parseRecipePage(
            "Fish Stew",
            recipePageHtml(
                "Fish Stew",
                anyIngredient("Any Fish", "Fish#list", "Any_Fish", 1) + tintIngredient("Wild Garlic", 2)
            ),
            "https://palia.wiki.gg"
        );
        expect(row).toEqual({
            name: "Fish Stew",
            description: "A basic fish stock.",
            rarity: 3,
            station: "Standard Stove",
            ingredients: [
                { name: "Any Fish", amount: 1, imageUrl: "https://palia.wiki.gg/images/Any_Fish.png" },
                { name: "Wild Garlic", amount: 2, imageUrl: "https://palia.wiki.gg/images/Wild_Garlic.png" },
            ],
            imageUrl: "https://palia.wiki.gg/images/Fish_Stew.png",
        });
    });

    it("builds the tints structure: one category, materials, rarity and the craft counters", () => {
        const rows = [
            parseRecipePage(
                "Fish Stew",
                recipePageHtml("Fish Stew", anyIngredient("Any Fish", "Fish#list", "Any_Fish", 1))
            ),
            parseRecipePage(
                "Apple Pie",
                recipePageHtml(
                    "Apple Pie",
                    tintIngredient("Apple", 3) + anyIngredient("Any Fish", "Fish#list", "Any_Fish", 2)
                )
            ),
            parseRecipePage("Empty", recipePageHtml("Empty", "")),
        ];
        const { template, imageUrls } = buildRecipeTemplate(rows, meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories).toEqual([{ id: "recipes", name: "Food Recipes", order: 0 }]);
        expect(template.materials?.map(m => [m.id, m.name])).toEqual([
            ["any-fish", "Any Fish"],
            ["apple", "Apple"],
        ]);
        expect(template.items.map(i => [i.id, i.materials, i.attributes, i.tags])).toEqual([
            [
                "apple-pie",
                { apple: 3, "any-fish": 2 },
                { rarity: 3 },
                ["Ingredient: Apple", "Ingredient: Any Fish", "Station: Standard Stove"],
            ],
            ["fish-stew", { "any-fish": 1 }, { rarity: 3 }, ["Ingredient: Any Fish", "Station: Standard Stove"]],
        ]);
        expect(template.counterDefs.map(c => [c.key, c.role, c.max, c.requires])).toEqual([
            ["acquired", undefined, 1, undefined],
            ["inventory", "owned", undefined, undefined],
            ["to-craft", "planned", undefined, "acquired"],
        ]);
        expect(imageUrls.get("material:any-fish")).toBe("https://palia.wiki.gg/images/Any_Fish.png");
        expect(imageUrls.size).toBe(4);
    });
});

/** A row of the Wallpaper page's table: image, name link and the "How to Obtain" cell. */
const wallpaperRow = (name: string, obtain: string) => `
<tr>
<td><img alt="${name}.png" src="/images/thumb/${name.replace(/ /g, "_")}.png/65px-${name.replace(/ /g, "_")}.png?99f8d9"></td>
<td><a href="/wiki/${name.replace(/ /g, "_")}"><span>${name}</span></a></td>
<td>${obtain}</td>
</tr>`;

const goldCost = (amount: string) =>
    `&#160;&#160;• <span class="template-cost template-cost-gold"><span><a href="/wiki/Gold" title="Gold"><img src="/images/thumb/Gold.png/28px-Gold.png"></a> <b>${amount}</b> <a href="/wiki/Gold" title="Gold">Gold</a></span></span><br />`;

const wallpaperHtml = `
<div class="mw-parser-output">
<table class="paliatable sortable"><tbody>
<tr><th>Image</th><th>Name</th><th>How to Obtain</th></tr>
${wallpaperRow("Marble Wainscotting", `<a href="/wiki/Furniture_Store#MS">Material Store</a><br />${goldCost("2,500")}`)}
${wallpaperRow("Blushing Ruby Stucco Wall", `<a href="/wiki/Villagers"><span>Villager</span></a><br />&#160;&#160;• <span><a href="/wiki/Eshe"><img alt="Eshe Profile.png" src="/images/thumb/Eshe_Profile.png/28px-Eshe_Profile.png"></a>&#160;<a href="/wiki/Eshe"><span>Eshe</span></a></span><br />`)}
${wallpaperRow("Nautical Beadboard", `<a href="/wiki/Paying_Respects_(Secret_Puzzle)"><span>Paying Respects</span></a> (Secret Puzzle)<br />`)}
${wallpaperRow("Furnace Parts Wallpaper", `<a href="/wiki/Mining_Guild">Mining Guild</a><br />&#160;&#160;• <b>220</b><br />`)}
${wallpaperRow("Mauve Stucco Wall", `<a>Accomplishment - Estate Builder</a><br />`)}
${wallpaperRow("Jolly Holly Wallpaper", "<b>Unavailable</b>")}
</tbody></table>
<table><tr><th>Points of Interest</th></tr><tr><td>x</td><td>y</td><td>z</td></tr></table>
</div>`;

describe("decor obtained once (wallpapers, floors, roofing)", () => {
    it("reads each wallpaper's sources with their costs or givers", () => {
        const rows = parseObtainableTable(wallpaperHtml, "https://palia.wiki.gg");
        expect(rows.map(r => r.name)).toEqual([
            "Marble Wainscotting",
            "Blushing Ruby Stucco Wall",
            "Nautical Beadboard",
            "Furnace Parts Wallpaper",
            "Mauve Stucco Wall",
            "Jolly Holly Wallpaper",
        ]);
        expect(rows[0].sources).toEqual([{ source: "Material Store", costs: ["2,500 Gold"] }]);
        expect(rows[1].sources).toEqual([{ source: "Villager", costs: ["Eshe"] }]);
        expect(rows[0].imageUrl).toBe("https://palia.wiki.gg/images/Marble_Wainscotting.png");
    });

    it("groups by kind of source, Unavailable last, with one Obtained checkbox counter", () => {
        const { template, imageUrls } = buildObtainableTemplate(parseObtainableTable(wallpaperHtml), meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => c.name)).toEqual([
            "Accomplishment",
            "Guild Stores",
            "Material Store",
            "Secret Puzzle",
            "Villager",
            "Unavailable",
        ]);
        expect(template.counterDefs).toEqual([
            { key: "obtained", label: "Obtained", kind: "manual", max: 1, order: 0 },
        ]);
        const byId = (id: string) => template.items.find(i => i.id === id);
        expect(byId("marble-wainscotting")).toMatchObject({
            categoryId: "material-store",
            description: "Material Store: 2,500 Gold",
            tags: ["Source: Material Store"],
        });
        expect(byId("blushing-ruby-stucco-wall")?.tags).toEqual(["Source: Villager", "Villager: Eshe"]);
        expect(byId("furnace-parts-wallpaper")?.categoryId).toBe("guild-stores");
        expect(byId("nautical-beadboard")?.categoryId).toBe("secret-puzzle");
        expect(byId("jolly-holly-wallpaper")).toMatchObject({ categoryId: "unavailable", description: "", tags: [] });
        expect(imageUrls.size).toBe(6);
    });
});

describe("food recipe items", () => {
    it("makes an item per distinct ingredient, Special when only one recipe needs it, Common by default", () => {
        const rows = [
            parseRecipePage(
                "Fish Stew",
                recipePageHtml("Fish Stew", anyIngredient("Any Fish", "Fish#list", "Any_Fish", 1))
            ),
            parseRecipePage(
                "Apple Pie",
                recipePageHtml(
                    "Apple Pie",
                    tintIngredient("Apple", 3) + anyIngredient("Any Fish", "Fish#list", "Any_Fish", 2)
                )
            ),
            parseRecipePage("Empty", recipePageHtml("Empty", "")),
        ];
        const { template, imageUrls } = buildRecipeItemTemplate(rows, meta);
        expect(templateSchema.safeParse(template).success).toBe(true);
        expect(validateTemplate(template)).toEqual([]);
        expect(template.categories.map(c => [c.id, c.name])).toEqual([
            ["common", "Common"],
            ["special", "Special"],
        ]);
        expect(template.defaultCategoryId).toBe("common");
        expect(template.counterDefs).toEqual([{ key: "amount", label: "Amount", kind: "manual", order: 0 }]);
        expect(template.items.map(i => [i.id, i.categoryId, i.description, i.tags])).toEqual([
            ["any-fish", "common", "Used in: Apple Pie, Fish Stew", ["Recipe: Apple Pie", "Recipe: Fish Stew"]],
            ["apple", "special", "Used in: Apple Pie", ["Recipe: Apple Pie"]],
        ]);
        expect(imageUrls.get("any-fish")).toBe("https://palia.wiki.gg/images/Any_Fish.png");
    });
});
