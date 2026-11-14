import { describe, expect, it } from "vitest";
import { fishTemplate } from "../src/Domain/TestFixtures.ts";
import { serialize } from "../src/Files/FileFormat.ts";
import { catalogSchema } from "../src/Schemas/CatalogSchema.ts";
import type { Template } from "../src/Schemas/TemplateSchema.ts";
import { buildCatalog, catalogPage, checkLayout } from "./CatalogBuilder.ts";

const file = (path: string, template: Template) => {
    const text = serialize(template);
    return { path, text, size: text.length };
};

const palia = (overrides: Partial<Template> = {}): Template => ({ ...fishTemplate(), game: "Palia", ...overrides });

describe("buildCatalog", () => {
    it("lists valid templates sorted by game and name, in the catalog format the app reads", () => {
        const { catalog, errors } = buildCatalog(
            [
                file("P/Palia/palia-fish.gitemplate.json", palia({ name: "Palia – Fish" })),
                file(
                    "A/Animal Game/animal-game-bugs.gitemplate.json",
                    palia({ templateId: "bugs", game: "Animal Game", name: "Bugs" })
                ),
            ],
            "2026-01-01T00:00:00.000Z"
        );
        expect(errors).toEqual([]);
        expect(catalog.templates.map(t => t.name)).toEqual(["Bugs", "Palia – Fish"]);
        expect(catalog.templates[1]).toMatchObject({
            game: "Palia",
            itemCount: 3,
            path: "P/Palia/palia-fish.gitemplate.json",
        });
        expect(catalogSchema.safeParse(catalog).success).toBe(true);
    });

    it("reports invalid files, saves, validation issues and duplicate template ids", () => {
        const broken = palia();
        broken.items[0] = { ...broken.items[0], categoryId: "nowhere" };
        const { errors } = buildCatalog(
            [
                { path: "P/Palia/bad.gitemplate.json", text: "{", size: 1 },
                { path: "P/Palia/save.gitemplate.json", text: '{"format":"game-item-tracker/save"}', size: 1 },
                file("P/Palia/broken.gitemplate.json", broken),
                file("P/Palia/copy.gitemplate.json", palia({ templateId: broken.templateId })),
            ],
            "2026-01-01T00:00:00.000Z"
        );
        expect(errors[0]).toBe("P/Palia/bad.gitemplate.json: The file is not valid JSON.");
        expect(errors[1]).toMatch(/^P\/Palia\/save\.gitemplate\.json: The save file is invalid/);
        expect(errors.some(e => e.startsWith("P/Palia/broken.gitemplate.json: items."))).toBe(true);
        expect(errors.at(-1)).toMatch(/copy\.gitemplate\.json: the templateId .* is already used by P\/Palia\/broken/);
    });
});

describe("checkLayout", () => {
    it("requires <Letter>/<Game>/<file> with the template's game", () => {
        expect(checkLayout("P/Palia/a.gitemplate.json", "Palia")).toEqual([]);
        expect(checkLayout("S/7 Days to Die/a.gitemplate.json", "7 Days to Die")).toEqual([]);
        expect(checkLayout("a.gitemplate.json", "Palia")).toHaveLength(1);
        expect(checkLayout("Q/Palia/a.gitemplate.json", "Palia")).toEqual([
            'Q/Palia/a.gitemplate.json: the letter folder should be "P"',
        ]);
        expect(checkLayout("P/palia/a.gitemplate.json", "Palia")).toHaveLength(1);
    });
});

describe("catalogPage", () => {
    it("links the templates and escapes their texts", () => {
        const { catalog } = buildCatalog(
            [file("P/Palia/a b.gitemplate.json", palia({ name: "<Fish & Co>" }))],
            "2026-01-01T00:00:00.000Z"
        );
        const html = catalogPage(catalog, "https://app.example/", "https://repo.example/");
        expect(html).toContain('href="P/Palia/a%20b.gitemplate.json"');
        expect(html).toContain("&lt;Fish &amp; Co&gt;");
        expect(html).not.toContain("<Fish");
    });
});
