import { describe, expect, it } from "vitest";
import { browseItems, buildSearchEntries, getSortOptions } from "./Browse.ts";
import { setCounterValue } from "./Counters.ts";
import { createSave } from "./CreateSave.ts";
import { buildSearchIndex, searchItems } from "./Search.ts";
import { fishTemplate, manyItems } from "./TestFixtures.ts";

const ids = (items: { id: string }[]) => items.map(i => i.id);

describe("search", () => {
    const t = fishTemplate();
    const save = createSave(t, "s");
    save.items.eel = { ...save.items.eel, notes: "Caught at midnight", customTags: ["favourite"] };
    const index = buildSearchIndex(buildSearchEntries(t, save));

    it("returns null for an empty query", () => {
        expect(searchItems(index, "  ")).toBeNull();
    });

    it.each([
        ["name", "koi", "koi"],
        ["name with a typo", "ancnet koi", "koi"],
        ["tag", "worm", "koi"],
        ["custom tag", "favourite", "eel"],
        ["description", "bountiful", "bass"],
        ["notes", "midnight", "eel"],
    ])("matches by %s", (_, query, expected) => {
        const ranks = searchItems(index, query);
        expect(ranks?.get(expected)).toBe(0);
    });
});

describe("browseItems", () => {
    const t = fishTemplate();

    it("sorts by name by default and supports both directions", () => {
        expect(ids(browseItems(t, undefined, { sort: "name", direction: "asc" }))).toEqual(["eel", "koi", "bass"]);
        expect(ids(browseItems(t, undefined, { sort: "name", direction: "desc" }))).toEqual(["bass", "koi", "eel"]);
    });

    it("sorts by attribute", () => {
        expect(ids(browseItems(t, undefined, { sort: "attr:rarity", direction: "desc" }))).toEqual([
            "koi",
            "eel",
            "bass",
        ]);
    });

    it("filters by category, including child categories", () => {
        expect(ids(browseItems(t, undefined, { categoryId: "rivers", sort: "name", direction: "asc" }))).toEqual([
            "eel",
            "koi",
        ]);
        expect(ids(browseItems(t, undefined, { categoryId: "coast", sort: "name", direction: "asc" }))).toEqual([
            "bass",
        ]);
    });

    it("sorts by counter totals and per-variant values with stable ties", () => {
        const save = createSave(t, "s");
        save.items.koi = setCounterValue(t, save.items.koi, "normal", "inventory", 5);
        save.items.bass = setCounterValue(t, save.items.bass, "starred", "placed", 3);
        expect(ids(browseItems(t, save, { sort: "counter:total", direction: "desc" }))).toEqual(["koi", "bass", "eel"]);
        expect(ids(browseItems(t, save, { sort: "counter:placed@starred", direction: "desc" }))).toEqual([
            "bass",
            "eel",
            "koi",
        ]);
    });

    it("sorts and filters by missing", () => {
        const save = createSave(t, "s");
        // bass has target 1 per variant by default -> missing 2
        expect(ids(browseItems(t, save, { sort: "missing", direction: "desc" }))).toEqual(["bass", "eel", "koi"]);
        expect(ids(browseItems(t, save, { sort: "name", direction: "asc", filters: { missingOnly: true } }))).toEqual([
            "bass",
        ]);
    });

    it("applies counter, notes and tag filters", () => {
        const save = createSave(t, "s");
        save.items.koi = { ...setCounterValue(t, save.items.koi, "normal", "tradeable", 1), notes: "hi" };
        const browse = (filters: object) => ids(browseItems(t, save, { sort: "name", direction: "asc", filters }));
        expect(browse({ counterAboveZero: "tradeable" })).toEqual(["koi"]);
        expect(browse({ withNotes: true })).toEqual(["koi"]);
        expect(browse({ tags: ["river"] })).toEqual(["eel", "koi"]);
        expect(browse({ tags: ["river", "worm"] })).toEqual(["koi"]);
    });

    it("orders by relevance best-first and only includes matches", () => {
        const ranks = new Map([
            ["koi", 1],
            ["bass", 0],
        ]);
        expect(ids(browseItems(t, undefined, { searchRanks: ranks, sort: "relevance", direction: "desc" }))).toEqual([
            "bass",
            "koi",
        ]);
    });

    it("lists sort options from the template", () => {
        const values = getSortOptions(t, true, true).map(o => o.value);
        expect(values).toContain("relevance");
        expect(values).toContain("attr:rarity");
        expect(values).toContain("missing");
        expect(values).toContain("counter:placed@starred");
        expect(values).not.toContain("counter:placed@normal");
        expect(getSortOptions(t, false, false).map(o => o.value)).toEqual(["name", "attr:rarity"]);
    });
});

describe("performance with 10 000 items", () => {
    it("searches and sorts within budget", () => {
        const t = { ...fishTemplate(), items: manyItems(10_000) };
        const save = createSave(t, "s");
        const index = buildSearchIndex(buildSearchEntries(t, save));

        const start = performance.now();
        const ranks = searchItems(index, "trout");
        const result = browseItems(t, save, { searchRanks: ranks, sort: "attr:rarity", direction: "desc" });
        const sorted = browseItems(t, save, { sort: "counter:total", direction: "desc" });
        const elapsed = performance.now() - start;

        expect(result.length).toBeGreaterThan(0);
        expect(sorted).toHaveLength(10_000);
        // Generous budget for slow CI machines; typically far below this.
        expect(elapsed).toBeLessThan(1000);
    });
});
