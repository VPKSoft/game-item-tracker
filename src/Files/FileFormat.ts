import type { z } from "zod";
import { slugify } from "../Domain/Ids.ts";
import { type Save, saveFormat, saveSchema } from "../Schemas/SaveSchema.ts";
import { type Template, templateFormat, templateSchema } from "../Schemas/TemplateSchema.ts";

/** The file extension of template files. */
const templateExtension = ".gitemplate.json";

/** The file extension of save files. */
const saveExtension = ".gisave.json";

/** The result of reading a file. */
type ParsedFile =
    | { kind: "template"; template: Template }
    | { kind: "save"; save: Save }
    | { kind: "error"; message: string };

const formatIssues = (error: z.ZodError) =>
    error.issues
        .slice(0, 5)
        .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");

/** Parses the text of a template or save file. The `format` field decides which one it is. */
const parseFileText = (text: string): ParsedFile => {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { kind: "error", message: "The file is not valid JSON." };
    }
    const format = typeof json === "object" && json !== null ? (json as { format?: unknown }).format : undefined;
    if (format === templateFormat) {
        const result = templateSchema.safeParse(json);
        return result.success
            ? { kind: "template", template: result.data }
            : { kind: "error", message: `The template file is invalid:\n${formatIssues(result.error)}` };
    }
    if (format === saveFormat) {
        const result = saveSchema.safeParse(json);
        return result.success
            ? { kind: "save", save: result.data }
            : { kind: "error", message: `The save file is invalid:\n${formatIssues(result.error)}` };
    }
    return {
        kind: "error",
        message: "This is not a Game Item Tracker file (expected a template or a save).",
    };
};

/** Creates a file name such as "palia-fish.gitemplate.json". */
const fileNameFor = (kind: "template" | "save", name: string) =>
    `${slugify(name)}${kind === "template" ? templateExtension : saveExtension}`;

/** Serializes a template or save into file text. */
const serialize = (value: Template | Save) => JSON.stringify(value, null, 2);

export type { ParsedFile };
export { fileNameFor, parseFileText, saveExtension, serialize, templateExtension };
