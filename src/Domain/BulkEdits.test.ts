import { describe, expect, it } from "vitest";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getBulkCounters, getBulkVariants, setCounterForItems } from "./BulkEdits.ts";
import { getCounterValue, getSaveItem } from "./Counters.ts";
import { createSave } from "./CreateSave.ts";
import { fishTemplate } from "./TestFixtures.ts";

const value = (t: Template, save: ReturnType<typeof createSave>, itemId: string, variant: string, key: string) =>
    getCounterValue(
        t,
        getSaveItem(save, itemId),
        variant,
        key,
        t.items.find(i => i.id === itemId)
    );

describe("bulk counter options", () => {
    it("lists editable manual counters only", () => {
        const t = fishTemplate();
        t.counterDefs.push({ key: "fixed", label: "Fixed", kind: "manual", readOnly: true, order: 5 });
        expect(getBulkCounters(t).map(c => c.key)).toEqual(["inventory", "placed", "target", "tradeable"]);
    });

    it("lists the variants a counter applies to", () => {
        const t = fishTemplate();
        const placed = t.counterDefs.find(c => c.key === "placed");
        const inventory = t.counterDefs.find(c => c.key === "inventory");
        expect(placed && getBulkVariants(t, placed).map(v => v.key)).toEqual(["starred"]);
        expect(inventory && getBulkVariants(t, inventory).map(v => v.key)).toEqual(["normal", "starred"]);
    });
});

describe("setCounterForItems", () => {
    it("sets every applicable variant of the selected items", () => {
        const t = fishTemplate();
        const save = createSave(t, "S");
        const result = setCounterForItems(t, save, ["bass", "eel"], "inventory", 5);
        expect(result.changed).toEqual(["bass", "eel"]);
        expect(result.skipped).toEqual([]);
        expect(value(t, result.save, "bass", "normal", "inventory")).toBe(5);
        expect(value(t, result.save, "bass", "starred", "inventory")).toBe(5);
        expect(value(t, result.save, "eel", "normal", "inventory")).toBe(5);
        expect(value(t, result.save, "koi", "normal", "inventory")).toBe(0);
        expect(result.save).not.toBe(save);
        expect(value(t, save, "bass", "normal", "inventory")).toBe(0);
    });

    it("sets only the chosen variant", () => {
        const t = fishTemplate();
        const result = setCounterForItems(t, createSave(t, "S"), ["bass", "koi"], "inventory", 3, "starred");
        expect(value(t, result.save, "bass", "starred", "inventory")).toBe(3);
        expect(value(t, result.save, "bass", "normal", "inventory")).toBe(0);
        expect(value(t, result.save, "koi", "starred", "inventory")).toBe(3);
    });

    it("skips items that do not have the counter's variant", () => {
        const t = fishTemplate();
        const result = setCounterForItems(t, createSave(t, "S"), ["bass", "eel"], "placed", 2);
        expect(result.changed).toEqual(["bass"]);
        expect(result.skipped).toEqual(["eel"]);
    });

    it("clamps to the counter's maximum and to zero", () => {
        const t = fishTemplate();
        const save = createSave(t, "S");
        expect(
            value(t, setCounterForItems(t, save, ["bass"], "tradeable", 500).save, "bass", "normal", "tradeable")
        ).toBe(99);
        const set = setCounterForItems(t, save, ["bass"], "inventory", 4).save;
        expect(
            value(t, setCounterForItems(t, set, ["bass"], "inventory", -3).save, "bass", "normal", "inventory")
        ).toBe(0);
    });

    it("skips unique variants, unknown items, computed counters and locked counters", () => {
        const t = fishTemplate();
        t.items[0] = { ...t.items[0], unique: true };
        t.counterDefs.push({ key: "sold", label: "Sold", kind: "manual", requires: "tradeable", order: 6 });
        const save = createSave(t, "S");
        expect(setCounterForItems(t, save, ["bass", "nope"], "inventory", 1)).toEqual({
            save,
            changed: [],
            skipped: ["bass", "nope"],
        });
        expect(setCounterForItems(t, save, ["koi"], "total", 1).skipped).toEqual(["koi"]);
        expect(setCounterForItems(t, save, ["koi"], "sold", 1).skipped).toEqual(["koi"]);
        const unlocked = setCounterForItems(t, save, ["koi"], "tradeable", 1, "normal").save;
        const sold = setCounterForItems(t, unlocked, ["koi"], "sold", 2);
        expect(sold.changed).toEqual(["koi"]);
        expect(value(t, sold.save, "koi", "normal", "sold")).toBe(2);
        expect(value(t, sold.save, "koi", "starred", "sold")).toBe(0);
    });

    it("skips items whose counter profile turns the counter off or fixes it", () => {
        const t: Template = {
            ...fishTemplate(),
            counterProfiles: [
                { key: "off", label: "Off", overrides: { inventory: { use: "off" } } },
                { key: "fixed", label: "Fixed", overrides: { inventory: { value: 1 } } },
            ],
        };
        t.items = t.items.map(i =>
            i.id === "bass" ? { ...i, counterProfile: "off" } : i.id === "koi" ? { ...i, counterProfile: "fixed" } : i
        );
        const result = setCounterForItems(t, createSave(t, "S"), ["bass", "koi", "eel"], "inventory", 7);
        expect(result.changed).toEqual(["eel"]);
        expect(result.skipped).toEqual(["bass", "koi"]);
    });
});
