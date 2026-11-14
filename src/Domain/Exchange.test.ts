import { describe, expect, it } from "vitest";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getSaveItem, setCounterValue, setObtained } from "./Counters.ts";
import { createSave, createTemplate } from "./CreateSave.ts";
import {
    addSuggestedEntries,
    buildExchangeTiles,
    canExchange,
    type ExchangeEntry,
    exchangeImageMetrics,
    getAutoColumns,
    getEntryKey,
    groupEntriesByItem,
    layoutExchangeImage,
    pruneEntries,
    removeEntry,
    setEntryAmount,
    suggestAmount,
    toggleEntry,
} from "./Exchange.ts";
import { fishTemplate } from "./TestFixtures.ts";

/** The fish fixture with a unique starred koi. */
const uniqueKoiTemplate = (): Template => {
    const t = fishTemplate();
    return { ...t, items: t.items.map(i => (i.id === "koi" ? { ...i, unique: ["starred"] } : i)) };
};

const withCounts = (t: Template, save: Save, itemId: string, variant: string, values: Record<string, number>) => {
    let saveItem = getSaveItem(save, itemId);
    for (const [key, value] of Object.entries(values)) {
        saveItem = setCounterValue(t, saveItem, variant, key, value);
    }
    return { ...save, items: { ...save.items, [itemId]: saveItem } };
};

const entry = (itemId: string, variantKey: string, mode: ExchangeEntry["mode"], amount = 1): ExchangeEntry => ({
    itemId,
    variantKey,
    mode,
    amount,
});

describe("suggestAmount", () => {
    it("needs target − owned and gives owned − target, never below zero", () => {
        const t = fishTemplate();
        let save = createSave(t, "S");
        save = withCounts(t, save, "bass", "normal", { inventory: 1, target: 4 });
        save = withCounts(t, save, "bass", "starred", { inventory: 2, placed: 3, target: 1 });
        const bass = t.items[0];
        expect(suggestAmount(t, bass, save.items.bass, "normal", "need")).toBe(3);
        expect(suggestAmount(t, bass, save.items.bass, "normal", "give")).toBe(0);
        expect(suggestAmount(t, bass, save.items.bass, "starred", "need")).toBe(0);
        expect(suggestAmount(t, bass, save.items.bass, "starred", "give")).toBe(4);
    });

    it("takes the give amount from a chosen counter", () => {
        const t = fishTemplate();
        const save = withCounts(t, createSave(t, "S"), "bass", "normal", { tradeable: 7, target: 9 });
        expect(suggestAmount(t, t.items[0], save.items.bass, "normal", "give", "tradeable")).toBe(7);
    });

    it("needs a unique variant once until it is obtained and never gives it", () => {
        const t = uniqueKoiTemplate();
        const koi = t.items[1];
        const save = createSave(t, "S");
        expect(suggestAmount(t, koi, save.items.koi, "starred", "need")).toBe(1);
        expect(suggestAmount(t, koi, save.items.koi, "starred", "give")).toBe(0);
        const obtained = setObtained(save.items.koi, "starred", true);
        expect(suggestAmount(t, koi, obtained, "starred", "need")).toBe(0);
        expect(canExchange(koi, "starred", "give")).toBe(false);
        expect(canExchange(koi, "normal", "give")).toBe(true);
    });

    it("suggests nothing without owned and target counters", () => {
        const t = { ...createTemplate("Plain", "Game"), items: fishTemplate().items };
        expect(suggestAmount(t, t.items[0], undefined, "_", "need")).toBe(0);
        expect(suggestAmount(t, t.items[0], undefined, "_", "give")).toBe(0);
    });
});

describe("entry list edits", () => {
    it("toggles, sets amounts (at least 1) and removes entries without mutating", () => {
        const start: ExchangeEntry[] = [];
        const added = toggleEntry(start, entry("bass", "normal", "give", 0));
        expect(start).toEqual([]);
        expect(added).toEqual([entry("bass", "normal", "give", 1)]);
        const both = toggleEntry(added, entry("bass", "normal", "need", 3));
        expect(both).toHaveLength(2);
        const key = getEntryKey(both[1]);
        expect(setEntryAmount(both, key, 0)[1].amount).toBe(1);
        expect(setEntryAmount(both, key, 4.6)[1].amount).toBe(5);
        expect(removeEntry(both, key)).toEqual(added);
        expect(toggleEntry(both, entry("bass", "normal", "give"))).toEqual([both[1]]);
    });
});

describe("addSuggestedEntries", () => {
    it("adds every variant with a suggestion and keeps existing entries", () => {
        const t = fishTemplate();
        let save = createSave(t, "S");
        save = withCounts(t, save, "koi", "starred", { target: 2 });
        save = withCounts(t, save, "eel", "normal", { inventory: 5, target: 1 });
        const existing = [entry("bass", "normal", "need", 9)];
        const needs = addSuggestedEntries(existing, t, save, t.items, "need");
        // Bass has a default target of 1 for both variants; the existing normal entry keeps its amount.
        expect(needs.entries).toEqual([
            entry("bass", "normal", "need", 9),
            entry("bass", "starred", "need", 1),
            entry("koi", "starred", "need", 2),
        ]);
        expect(needs.added).toBe(2);
        const gives = addSuggestedEntries([], t, save, t.items, "give");
        expect(gives.entries).toEqual([entry("eel", "normal", "give", 4)]);
    });

    it("skips unique variants when giving", () => {
        const t = uniqueKoiTemplate();
        let save = createSave(t, "S");
        save = { ...save, items: { ...save.items, koi: setObtained(save.items.koi, "starred", true) } };
        expect(addSuggestedEntries([], t, save, [t.items[1]], "give").added).toBe(0);
    });
});

describe("pruneEntries", () => {
    it("drops entries of removed items, removed variants and variants that became unique", () => {
        const t = uniqueKoiTemplate();
        const entries = [
            entry("bass", "normal", "give"),
            entry("gone", "normal", "need"),
            entry("eel", "starred", "need"),
            entry("koi", "starred", "give"),
            entry("koi", "starred", "need"),
        ];
        expect(pruneEntries(t, entries)).toEqual([entries[0], entries[4]]);
        const kept = [entries[0]];
        expect(pruneEntries(t, kept)).toBe(kept);
    });
});

describe("groupEntriesByItem", () => {
    it("reuses the previous array of an item whose entries did not change", () => {
        const a = entry("bass", "normal", "give");
        const b = entry("koi", "normal", "need");
        const first = groupEntriesByItem([a, b]);
        const c = entry("koi", "starred", "need");
        const second = groupEntriesByItem([a, b, c], first);
        expect(second.get("bass")).toBe(first.get("bass"));
        expect(second.get("koi")).toEqual([b, c]);
        expect(second.get("koi")).not.toBe(first.get("koi"));
    });
});

describe("buildExchangeTiles", () => {
    it("uses item names, variant labels and images by mode", () => {
        const base = fishTemplate();
        const t: Template = {
            ...base,
            images: { img1: "data:image/png;base64,AA==" },
            items: base.items.map(i => (i.id === "bass" ? { ...i, imageId: "img1" } : i)),
        };
        const tiles = buildExchangeTiles(t, [
            entry("bass", "starred", "give", 2),
            entry("koi", "normal", "need", 3),
            entry("missing", "normal", "need"),
        ]);
        expect(tiles.give).toEqual([
            {
                key: "give|bass|starred",
                name: "Bass",
                variantLabel: "Starred",
                amount: 2,
                image: "data:image/png;base64,AA==",
            },
        ]);
        expect(tiles.need.map(x => [x.name, x.variantLabel, x.amount, x.image])).toEqual([
            ["Ancient Koi", "Normal", 3, undefined],
        ]);
    });

    it("has no variant label for items without variants", () => {
        const t = { ...createTemplate("Plain", "Game"), items: fishTemplate().items };
        expect(buildExchangeTiles(t, [entry("bass", "_", "need")]).need[0].variantLabel).toBe("");
    });
});

describe("layoutExchangeImage", () => {
    const { tileSize, gap, padding, titleHeight, headingHeight, sectionGap } = exchangeImageMetrics;

    it("chooses 3–8 automatic columns from the larger section", () => {
        expect(getAutoColumns({ give: 1, need: 0 })).toBe(3);
        expect(getAutoColumns({ give: 2, need: 5 })).toBe(5);
        expect(getAutoColumns({ give: 40, need: 1 })).toBe(8);
    });

    it("places the title, the give section and the need section", () => {
        const layout = layoutExchangeImage({ give: 5, need: 2 }, { columns: 4, hasTitle: true });
        const contentWidth = 4 * tileSize + 3 * gap;
        expect(layout.width).toBe(contentWidth + 2 * padding);
        expect(layout.title).toEqual({ x: padding, y: padding, width: contentWidth, height: titleHeight });
        expect(layout.sections.map(s => s.mode)).toEqual(["give", "need"]);
        const give = layout.sections[0];
        expect(give.heading.y).toBe(padding + titleHeight);
        expect(give.tiles).toHaveLength(5);
        expect(give.tiles[4]).toEqual({
            x: padding,
            y: padding + titleHeight + headingHeight + tileSize + gap,
            width: tileSize,
            height: tileSize,
        });
        const need = layout.sections[1];
        const giveBottom = give.tiles[4].y + tileSize;
        expect(need.heading.y).toBe(giveBottom + sectionGap);
        expect(need.tiles[1].x).toBe(padding + tileSize + gap);
        expect(layout.height).toBe(need.heading.y + headingHeight + tileSize + padding);
    });

    it("leaves out empty sections and the title", () => {
        const layout = layoutExchangeImage({ give: 0, need: 1 }, { hasTitle: false });
        expect(layout.title).toBeUndefined();
        expect(layout.sections.map(s => s.mode)).toEqual(["need"]);
        expect(layout.sections[0].heading.y).toBe(padding);
        expect(layout.columns).toBe(3);
    });
});
