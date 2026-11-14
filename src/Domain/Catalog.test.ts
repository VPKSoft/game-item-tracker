import { afterEach, describe, expect, it, vi } from "vitest";
import { serialize } from "../Files/FileFormat.ts";
import { fetchCatalog, fetchCatalogTemplate } from "../Files/OnlineCatalog.ts";
import { type Catalog, type CatalogEntry, catalogFormat, catalogSchemaVersion } from "../Schemas/CatalogSchema.ts";
import { LocalizedError } from "../Types/LocalizedMessage.ts";
import { catalogFileUrl, filterCatalog, getCatalogStatus } from "./Catalog.ts";
import { fishTemplate } from "./TestFixtures.ts";

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
    templateId: "fish",
    version: "1.1.0",
    name: "Fish",
    game: "Palia",
    itemCount: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
    path: "P/Palia/palia-fish.gitemplate.json",
    size: 1234,
    ...overrides,
});

const catalogOf = (...templates: CatalogEntry[]): Catalog => ({
    format: catalogFormat,
    schemaVersion: catalogSchemaVersion,
    generatedAt: "2026-01-01T00:00:00.000Z",
    templates,
});

describe("getCatalogStatus", () => {
    it("compares the online version with the stored versions", () => {
        const e = entry();
        expect(getCatalogStatus(e, [])).toBe("new");
        expect(getCatalogStatus(e, [{ templateId: "other", version: "1.1.0" }])).toBe("new");
        expect(getCatalogStatus(e, [{ templateId: "fish", version: "1.1.0" }])).toBe("installed");
        expect(getCatalogStatus(e, [{ templateId: "fish", version: "1.0.0" }])).toBe("update");
        expect(
            getCatalogStatus(e, [
                { templateId: "fish", version: "1.0.0" },
                { templateId: "fish", version: "1.10.0" },
            ])
        ).toBe("older");
    });
});

describe("filterCatalog", () => {
    it("matches every word in the game, name or description and sorts by game and name", () => {
        const entries = [
            entry({ name: "Plushies", templateId: "p" }),
            entry({ game: "Animal Game", name: "Bugs", description: "Every bug", templateId: "b" }),
            entry({ name: "Fish", templateId: "f" }),
        ];
        expect(filterCatalog(entries, "").map(e => e.templateId)).toEqual(["b", "f", "p"]);
        expect(filterCatalog(entries, "palia FISH").map(e => e.templateId)).toEqual(["f"]);
        expect(filterCatalog(entries, "bug").map(e => e.templateId)).toEqual(["b"]);
        expect(filterCatalog(entries, "nothing")).toEqual([]);
    });
});

describe("catalogFileUrl", () => {
    it("resolves the path against the catalog URL and encodes each segment", () => {
        expect(catalogFileUrl("https://example.com/data/index.json", "S/7 Days to Die/a#b.gitemplate.json")).toBe(
            "https://example.com/data/S/7%20Days%20to%20Die/a%23b.gitemplate.json"
        );
    });
});

describe("online catalog", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const stubFetch = (responses: Record<string, { status?: number; body: string }>) => {
        const fetchMock = vi.fn(async (url: string) => {
            const response = responses[url];
            return response
                ? new Response(response.body, { status: response.status ?? 200 })
                : new Response("not found", { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    };

    const catalogUrl = "https://example.com/data/index.json";

    it("loads and validates the catalog without using a stale cache", async () => {
        const fetchMock = stubFetch({ [catalogUrl]: { body: JSON.stringify(catalogOf(entry())) } });
        expect((await fetchCatalog(catalogUrl)).templates).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledWith(catalogUrl, { cache: "no-cache" });
    });

    it("reports an unreachable or invalid catalog as coded errors", async () => {
        stubFetch({});
        await expect(fetchCatalog(catalogUrl)).rejects.toMatchObject({
            code: "catalogUnavailable",
            params: { details: "HTTP 404" },
        });
        stubFetch({ [catalogUrl]: { body: JSON.stringify({ format: "something-else" }) } });
        await expect(fetchCatalog(catalogUrl)).rejects.toBeInstanceOf(LocalizedError);
        await expect(fetchCatalog(catalogUrl)).rejects.toMatchObject({ code: "catalogInvalid" });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            })
        );
        await expect(fetchCatalog(catalogUrl)).rejects.toMatchObject({
            code: "catalogUnavailable",
            params: { details: "Failed to fetch" },
        });
    });

    it("downloads a listed template and checks its id and version", async () => {
        const template = fishTemplate();
        const listed = entry({ templateId: template.templateId, version: template.version });
        const fileUrl = "https://example.com/data/P/Palia/palia-fish.gitemplate.json";
        stubFetch({ [fileUrl]: { body: serialize(template) } });
        expect((await fetchCatalogTemplate(listed, catalogUrl)).templateId).toBe(template.templateId);

        await expect(fetchCatalogTemplate({ ...listed, version: "9.0.0" }, catalogUrl)).rejects.toMatchObject({
            code: "onlineTemplateMismatch",
        });
        stubFetch({ [fileUrl]: { body: "{" } });
        await expect(fetchCatalogTemplate(listed, catalogUrl)).rejects.toMatchObject({ code: "invalidJson" });
    });
});
