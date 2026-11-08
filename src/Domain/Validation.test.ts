import { describe, expect, it } from "vitest";
import { saveSchema } from "../Schemas/SaveSchema.ts";
import { templateSchema } from "../Schemas/TemplateSchema.ts";
import { createSave } from "./CreateSave.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { validateTemplate } from "./Validation.ts";

const messages = (t: ReturnType<typeof fishTemplate>) => validateTemplate(t).map(i => i.message);

describe("validateTemplate", () => {
    it("accepts a consistent template", () => {
        expect(validateTemplate(fishTemplate())).toEqual([]);
    });

    it("reports duplicate ids and keys", () => {
        const t = fishTemplate();
        t.items.push({ ...t.items[0] });
        t.counterDefs.push({ ...t.counterDefs[0] });
        expect(messages(t)).toEqual(
            expect.arrayContaining(['Duplicate item id "bass"', 'Duplicate counter key "inventory"'])
        );
    });

    it("rejects computed counters that sum computed or unknown counters, or nothing", () => {
        const t = fishTemplate();
        t.counterDefs.push(
            { key: "grand", label: "Grand", kind: "computed", sumOf: ["total"], order: 9 },
            { key: "bad", label: "Bad", kind: "computed", sumOf: ["nope"], order: 10 },
            { key: "empty", label: "Empty", kind: "computed", sumOf: [], order: 11 }
        );
        const m = messages(t);
        expect(m.some(x => x.includes("can only sum manual counters"))).toBe(true);
        expect(m.some(x => x.includes('unknown counter "nope"'))).toBe(true);
        expect(m.some(x => x.includes("does not sum any counters"))).toBe(true);
    });

    it("rejects duplicate roles", () => {
        const t = fishTemplate();
        t.counterDefs[0].role = "owned";
        expect(messages(t)).toContain('Only one counter can have the role "owned"');
    });

    it("rejects broken references and out-of-range attributes", () => {
        const t = fishTemplate();
        t.items[0] = {
            ...t.items[0],
            categoryId: "nowhere",
            imageId: "missing",
            variants: ["golden"],
            attributes: { rarity: 9, size: 1 },
            defaults: { total: 1 },
        };
        t.counterDefs[0].variants = ["golden"];
        t.categories[0].parentId = "ghost";
        const m = messages(t);
        expect(m).toEqual(
            expect.arrayContaining([
                'Item "Bass" refers to unknown category "nowhere"',
                'Item "Bass" refers to a missing image',
                'Item "Bass" refers to unknown variant "golden"',
                'Item "Bass" has Rarity 9, outside 1–5',
                'Item "Bass" has unknown attribute "size"',
                'Item "Bass" has a default for unknown manual counter "total"',
                'Counter "Inventory" refers to unknown variant "golden"',
                'Unknown parent category "ghost"',
            ])
        );
    });
});

describe("schemas", () => {
    it("accepts the fixtures", () => {
        expect(templateSchema.safeParse(fishTemplate()).success).toBe(true);
        expect(saveSchema.safeParse(createSave(fishTemplate(), "s")).success).toBe(true);
    });

    it("rejects wrong formats, versions and negative counts", () => {
        expect(templateSchema.safeParse({ ...fishTemplate(), format: "x" }).success).toBe(false);
        expect(templateSchema.safeParse({ ...fishTemplate(), version: "1.0" }).success).toBe(false);
        const save = createSave(fishTemplate(), "s");
        save.items.bass.counts.normal.target = -1;
        expect(saveSchema.safeParse(save).success).toBe(false);
    });
});
