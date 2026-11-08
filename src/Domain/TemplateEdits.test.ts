import { describe, expect, it } from "vitest";
import {
    addImage,
    countTags,
    deleteAttribute,
    deleteCategory,
    deleteCounter,
    deleteItem,
    deleteTag,
    deleteVariant,
    moveOrdered,
    newVersion,
    renameTag,
    upsertItem,
} from "./TemplateEdits.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { validateTemplate } from "./Validation.ts";

describe("template edits", () => {
    it("adds and replaces items, collecting new tags into the vocabulary", () => {
        const t = fishTemplate();
        const added = upsertItem(t, { ...t.items[0], id: "new", tags: ["fresh"] });
        expect(added.items).toHaveLength(4);
        expect(added.tags).toContain("fresh");
        const replaced = upsertItem(added, { ...added.items[0], name: "Renamed" });
        expect(replaced.items[0].name).toBe("Renamed");
        expect(replaced.items).toHaveLength(4);
    });

    it("prunes images no item uses", () => {
        let t = addImage(fishTemplate(), "img1", "data:image/webp;base64,AA==");
        t = upsertItem(t, { ...t.items[0], imageId: "img1" });
        expect(t.images.img1).toBeDefined();
        t = deleteItem(t, "bass");
        expect(t.images.img1).toBeUndefined();
    });

    it("deletes a category, moving items and unparenting children", () => {
        const t = deleteCategory(fishTemplate(), "rivers", "coast");
        expect(t.items.find(i => i.id === "koi")?.categoryId).toBe("coast");
        expect(t.categories.find(c => c.id === "upper-rivers")?.parentId).toBeUndefined();
        expect(validateTemplate(t)).toEqual([]);
    });

    it("deletes a counter with its references", () => {
        const t = deleteCounter(fishTemplate(), "placed");
        expect(t.counterDefs.find(c => c.key === "total")?.sumOf).toEqual(["inventory"]);
        const t2 = deleteCounter(fishTemplate(), "target");
        expect(t2.items[0].defaults).toEqual({});
        expect(validateTemplate(t2)).toEqual([]);
    });

    it("deletes a variant with its references", () => {
        const t = deleteVariant(fishTemplate(), "starred");
        expect(t.counterDefs.find(c => c.key === "placed")?.variants).toBeUndefined();
        expect(validateTemplate(t)).toEqual([]);
        const t2 = deleteVariant(fishTemplate(), "normal");
        expect(t2.items.find(i => i.id === "eel")?.variants).toBeUndefined();
    });

    it("deletes an attribute with its values", () => {
        const t = deleteAttribute(fishTemplate(), "rarity");
        expect(t.items.every(i => !("rarity" in i.attributes))).toBe(true);
    });

    it("renames, merges and deletes tags", () => {
        const renamed = renameTag(fishTemplate(), "river", "freshwater");
        expect(renamed.tags).toEqual(["coast", "freshwater", "worm"]);
        expect(renamed.items[1].tags).toEqual(["freshwater", "worm"]);
        const merged = renameTag(fishTemplate(), "worm", "river");
        expect(merged.items[1].tags).toEqual(["river"]);
        expect(merged.tags).toEqual(["coast", "river"]);
        expect(deleteTag(fishTemplate(), "river").items[2].tags).toEqual([]);
        expect(countTags(fishTemplate()).get("river")).toBe(2);
    });

    it("reorders lists", () => {
        const list = [
            { key: "a", order: 0 },
            { key: "b", order: 1 },
            { key: "c", order: 2 },
        ];
        expect(moveOrdered(list, 2, -1).map(e => e.key)).toEqual(["a", "c", "b"]);
        expect(moveOrdered(list, 0, -1).map(e => e.key)).toEqual(["a", "b", "c"]);
    });

    it("creates a new version", () => {
        expect(newVersion(fishTemplate(), "minor").version).toBe("1.1.0");
    });
});
