import { describe, expect, it } from "vitest";
import type { SaveSummary, TemplateSummary } from "../Storage/Database.ts";
import { filterSaves, filterTemplates } from "./LibrarySearch.ts";

const template = (templateId: string, name: string, game: string, version = "1.0.0"): TemplateSummary => ({
    templateId,
    version,
    name,
    game,
    itemCount: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
});

const save = (saveId: string, name: string, templateName: string, game: string, version = "1.0.0"): SaveSummary => ({
    saveId,
    name,
    template: { templateId: templateName.toLowerCase(), version, name: templateName, game },
    updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("filterTemplates", () => {
    const templates = [
        template("fish", "Fish", "Palia", "1.2.0"),
        template("bugs", "Bugs", "Palia"),
        template("plants", "Plants", "Garden Game"),
    ];

    it("keeps every template, in order, for an empty query", () => {
        expect(filterTemplates(templates, "  ").map(t => t.templateId)).toEqual(["fish", "bugs", "plants"]);
    });

    it("matches every word in the name, game or version, ignoring case", () => {
        expect(filterTemplates(templates, "palia").map(t => t.templateId)).toEqual(["fish", "bugs"]);
        expect(filterTemplates(templates, "PALIA fi").map(t => t.templateId)).toEqual(["fish"]);
        expect(filterTemplates(templates, "1.2").map(t => t.templateId)).toEqual(["fish"]);
        expect(filterTemplates(templates, "garden bugs")).toEqual([]);
    });
});

describe("filterSaves", () => {
    const saves = [save("a", "Main", "Fish", "Palia"), save("b", "Second run", "Bugs", "Bug Game", "2.0.0")];

    it("matches every word in the save name or its template name, game and version", () => {
        expect(filterSaves(saves, "").map(s => s.saveId)).toEqual(["a", "b"]);
        expect(filterSaves(saves, "main").map(s => s.saveId)).toEqual(["a"]);
        expect(filterSaves(saves, "bugs run").map(s => s.saveId)).toEqual(["b"]);
        expect(filterSaves(saves, "2.0").map(s => s.saveId)).toEqual(["b"]);
        expect(filterSaves(saves, "palia").map(s => s.saveId)).toEqual(["a"]);
        expect(filterSaves(saves, "fish second")).toEqual([]);
    });
});
