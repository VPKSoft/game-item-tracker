import { describe, expect, it } from "vitest";
import { saveSchema } from "../Schemas/SaveSchema.ts";
import { browseItems } from "./Browse.ts";
import { createSave } from "./CreateSave.ts";
import { countHiddenItems, hiddenCategoryId, isItemHidden, setHiddenForItems, setItemHidden } from "./HiddenItems.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { hasUserData, upgradeSave } from "./UpgradeSave.ts";

const ids = (items: { id: string }[]) => items.map(i => i.id);

describe("hidden items", () => {
    const t = fishTemplate();

    it("sets and clears the hidden mark, removing the field when shown", () => {
        const item = createSave(t, "s").items.koi;
        const hidden = setItemHidden(item, true);
        expect(hidden.hidden).toBe(true);
        expect(isItemHidden(hidden)).toBe(true);
        expect(setItemHidden(hidden, true)).toBe(hidden);
        const shown = setItemHidden(hidden, false);
        expect("hidden" in shown).toBe(false);
        expect(isItemHidden(shown)).toBe(false);
        expect(isItemHidden(undefined)).toBe(false);
    });

    it("hides many items, ignoring unknown ones and returning the same save without changes", () => {
        const save = createSave(t, "s");
        const result = setHiddenForItems(t, save, ["koi", "eel", "missing"], true);
        expect(result.changed).toEqual(["koi", "eel"]);
        expect(countHiddenItems(t, result.save)).toBe(2);
        expect(setHiddenForItems(t, result.save, ["koi"], true).save).toBe(result.save);
        const shown = setHiddenForItems(t, result.save, ["koi"], false);
        expect(shown.changed).toEqual(["koi"]);
        expect(countHiddenItems(t, shown.save)).toBe(1);
    });

    it("leaves hidden items out of every category and shows them only in the Hidden category", () => {
        const save = setHiddenForItems(t, createSave(t, "s"), ["koi"], true).save;
        const browse = (categoryId: string | null) =>
            ids(browseItems(t, save, { categoryId, sort: "name", direction: "asc" }));
        expect(browse(null)).toEqual(["eel", "bass"]);
        expect(browse("rivers")).toEqual(["eel"]);
        expect(browse(hiddenCategoryId)).toEqual(["koi"]);
        // Unhiding puts the item back into its own category.
        const shown = setHiddenForItems(t, save, ["koi"], false).save;
        expect(ids(browseItems(t, shown, { categoryId: "rivers", sort: "name", direction: "asc" }))).toEqual([
            "eel",
            "koi",
        ]);
        expect(ids(browseItems(t, shown, { categoryId: hiddenCategoryId, sort: "name", direction: "asc" }))).toEqual(
            []
        );
    });

    it("applies search and filters inside the Hidden category", () => {
        const save = setHiddenForItems(t, createSave(t, "s"), ["koi", "bass"], true).save;
        const items = browseItems(t, save, {
            categoryId: hiddenCategoryId,
            searchRanks: new Map([["koi", 0]]),
            sort: "relevance",
            direction: "asc",
        });
        expect(ids(items)).toEqual(["koi"]);
    });

    it("ignores the Hidden category without a save (template editor)", () => {
        expect(ids(browseItems(t, undefined, { categoryId: null, sort: "name", direction: "asc" }))).toHaveLength(3);
    });

    it("is user data kept by upgrades and accepted by the save schema", () => {
        const save = setHiddenForItems(t, createSave(t, "s"), ["koi"], true).save;
        expect(hasUserData(save.items.koi)).toBe(true);
        expect(saveSchema.parse(save).items.koi.hidden).toBe(true);
        const deprecated = { ...t, version: "1.1.0", items: t.items.map(i => ({ ...i, deprecated: true })) };
        const upgraded = upgradeSave(save, t, deprecated).save;
        // Eel has no user data and is dropped; the hidden mark keeps koi.
        expect(Object.keys(upgraded.items)).toContain("koi");
        expect(Object.keys(upgraded.items)).not.toContain("eel");
        expect(upgraded.items.koi.hidden).toBe(true);
    });
});
