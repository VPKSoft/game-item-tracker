import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";

/** A lightweight description of a stored template, listed without loading items or images. */
type TemplateSummary = {
    templateId: string;
    version: string;
    name: string;
    game: string;
    itemCount: number;
    updatedAt: string;
    lastExportedAt?: string;
};

/** A lightweight description of a stored save. */
type SaveSummary = {
    saveId: string;
    name: string;
    template: Save["template"];
    updatedAt: string;
    lastExportedAt?: string;
};

interface TrackerDb extends DBSchema {
    templates: { key: [string, string]; value: Template };
    templateSummaries: { key: [string, string]; value: TemplateSummary };
    saves: { key: string; value: Save };
    saveSummaries: { key: string; value: SaveSummary };
    meta: { key: string; value: unknown };
}

const databaseName = "game-item-tracker";

let dbPromise: Promise<IDBPDatabase<TrackerDb>> | null = null;

const getDb = () => {
    if (!dbPromise) {
        dbPromise = openDB<TrackerDb>(databaseName, 1, {
            upgrade(db) {
                db.createObjectStore("templates", { keyPath: ["templateId", "version"] });
                db.createObjectStore("templateSummaries", { keyPath: ["templateId", "version"] });
                db.createObjectStore("saves", { keyPath: "saveId" });
                db.createObjectStore("saveSummaries", { keyPath: "saveId" });
                db.createObjectStore("meta");
            },
        });
    }
    return dbPromise;
};

/** Closes the connection and forgets it (used by tests). */
const closeDatabase = async () => {
    if (dbPromise) {
        (await dbPromise).close();
        dbPromise = null;
    }
};

/** Stores a template version. Keeps the previous export time of the same version. */
const putTemplate = async (template: Template, exported = false) => {
    const db = await getDb();
    const key: [string, string] = [template.templateId, template.version];
    const previous = await db.get("templateSummaries", key);
    const tx = db.transaction(["templates", "templateSummaries"], "readwrite");
    await Promise.all([
        tx.objectStore("templates").put(template),
        tx.objectStore("templateSummaries").put({
            templateId: template.templateId,
            version: template.version,
            name: template.name,
            game: template.game,
            itemCount: template.items.length,
            updatedAt: template.updatedAt,
            lastExportedAt: exported ? new Date().toISOString() : previous?.lastExportedAt,
        }),
        tx.done,
    ]);
};

const getTemplate = async (templateId: string, version: string) =>
    (await getDb()).get("templates", [templateId, version]);

const listTemplates = async () => (await getDb()).getAll("templateSummaries");

/** Gets the summaries of every stored version of a template. */
const listTemplateVersions = async (templateId: string) =>
    (await listTemplates()).filter(t => t.templateId === templateId);

const deleteTemplate = async (templateId: string, version: string) => {
    const db = await getDb();
    const tx = db.transaction(["templates", "templateSummaries"], "readwrite");
    await Promise.all([
        tx.objectStore("templates").delete([templateId, version]),
        tx.objectStore("templateSummaries").delete([templateId, version]),
        tx.done,
    ]);
};

/** Stores a save. The embedded bundle, if any, is not kept in the database. */
const putSave = async (save: Save, exported = false) => {
    const db = await getDb();
    const { bundle: _bundle, ...rest } = save;
    const previous = await db.get("saveSummaries", save.saveId);
    const tx = db.transaction(["saves", "saveSummaries"], "readwrite");
    await Promise.all([
        tx.objectStore("saves").put(rest),
        tx.objectStore("saveSummaries").put({
            saveId: save.saveId,
            name: save.name,
            template: save.template,
            updatedAt: save.updatedAt,
            lastExportedAt: exported ? new Date().toISOString() : previous?.lastExportedAt,
        }),
        tx.done,
    ]);
};

const getSave = async (saveId: string) => (await getDb()).get("saves", saveId);

const listSaves = async () => (await getDb()).getAll("saveSummaries");

const deleteSave = async (saveId: string) => {
    const db = await getDb();
    const tx = db.transaction(["saves", "saveSummaries"], "readwrite");
    await Promise.all([
        tx.objectStore("saves").delete(saveId),
        tx.objectStore("saveSummaries").delete(saveId),
        tx.done,
    ]);
};

const getMeta = async <T>(key: string): Promise<T | undefined> => (await getDb()).get("meta", key) as Promise<T>;

const setMeta = async (key: string, value: unknown) => {
    await (await getDb()).put("meta", value, key);
};

/** Asks the browser not to evict the data. Returns whether storage is persistent. */
const requestPersistentStorage = async () => {
    try {
        if (navigator.storage?.persist) {
            return await navigator.storage.persist();
        }
    } catch {
        // Not supported or denied; data still works, it is just evictable.
    }
    return false;
};

export type { SaveSummary, TemplateSummary };
export {
    closeDatabase,
    deleteSave,
    deleteTemplate,
    getMeta,
    getSave,
    getTemplate,
    listSaves,
    listTemplates,
    listTemplateVersions,
    putSave,
    putTemplate,
    requestPersistentStorage,
    setMeta,
};
