import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSave } from "../Domain/CreateSave.ts";
import { fishTemplate } from "../Domain/TestFixtures.ts";
import { fileNameFor, parseFileText, serialize } from "../Files/FileIo.ts";
import {
    closeDatabase,
    deleteSave,
    getMeta,
    getSave,
    getTemplate,
    listSaves,
    listTemplates,
    putSave,
    putTemplate,
    setMeta,
} from "./Database.ts";
import { useAutosave } from "./UseAutosave.ts";

describe("database", () => {
    beforeEach(async () => {
        await closeDatabase();
        indexedDB.deleteDatabase("game-item-tracker");
    });

    it("round-trips templates by id and version, and lists summaries", async () => {
        const t = fishTemplate();
        await putTemplate(t);
        await putTemplate({ ...t, version: "1.1.0" }, true);
        expect((await getTemplate(t.templateId, "1.0.0"))?.items).toHaveLength(3);
        const summaries = await listTemplates();
        expect(summaries.map(s => s.version).sort()).toEqual(["1.0.0", "1.1.0"]);
        expect(summaries.find(s => s.version === "1.1.0")?.lastExportedAt).toBeDefined();
        expect(summaries[0].itemCount).toBe(3);
    });

    it("round-trips saves without the embedded bundle, and deletes them", async () => {
        const save = { ...createSave(fishTemplate(), "Mine"), bundle: fishTemplate() };
        await putSave(save);
        const stored = await getSave(save.saveId);
        expect(stored?.name).toBe("Mine");
        expect(stored?.bundle).toBeUndefined();
        expect(await listSaves()).toHaveLength(1);
        await deleteSave(save.saveId);
        expect(await listSaves()).toHaveLength(0);
    });

    it("stores meta values", async () => {
        await setMeta("lastSave", "abc");
        expect(await getMeta<string>("lastSave")).toBe("abc");
    });
});

describe("file io", () => {
    it("detects templates and saves by their format field", () => {
        const t = fishTemplate();
        expect(parseFileText(serialize(t)).kind).toBe("template");
        expect(parseFileText(serialize(createSave(t, "s"))).kind).toBe("save");
    });

    it("explains invalid input", () => {
        expect(parseFileText("{nope")).toEqual({ kind: "error", message: "The file is not valid JSON." });
        expect(parseFileText('{"hello": 1}')).toMatchObject({ kind: "error" });
        const broken = parseFileText(serialize({ ...fishTemplate(), version: "x" }));
        expect(broken.kind).toBe("error");
        expect(broken.kind === "error" && broken.message).toContain("version");
    });

    it("names files with the role extensions", () => {
        expect(fileNameFor("template", "Palia – Fish")).toBe("palia-fish.gitemplate.json");
        expect(fileNameFor("save", "My Palia")).toBe("my-palia.gisave.json");
    });
});

describe("useAutosave", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("does not save the initial value and debounces changes", () => {
        const save = vi.fn();
        const { rerender } = renderHook(({ value }) => useAutosave(value, save, 500), {
            initialProps: { value: { n: 0 } },
        });
        rerender({ value: { n: 1 } });
        rerender({ value: { n: 2 } });
        expect(save).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(save).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith({ n: 2 });
    });

    it("flushes pending changes when the page is hidden and on unmount", () => {
        const save = vi.fn();
        const { rerender, unmount } = renderHook(({ value }) => useAutosave(value, save, 500), {
            initialProps: { value: { n: 0 } },
        });
        rerender({ value: { n: 1 } });
        window.dispatchEvent(new Event("pagehide"));
        expect(save).toHaveBeenCalledWith({ n: 1 });
        rerender({ value: { n: 2 } });
        unmount();
        expect(save).toHaveBeenLastCalledWith({ n: 2 });
        expect(save).toHaveBeenCalledTimes(2);
    });
});
