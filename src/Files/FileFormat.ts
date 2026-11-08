import type { z } from "zod";
import { slugify } from "../Domain/Ids.ts";
import { type Save, saveFormat, saveSchema } from "../Schemas/SaveSchema.ts";
import { type Template, templateFormat, templateSchema } from "../Schemas/TemplateSchema.ts";
import { createMessage, type LocalizedMessage } from "../Types/LocalizedMessage.ts";

/** The file extension of template files. */
const templateExtension = ".gitemplate.json";

/** The file extension of save files. */
const saveExtension = ".gisave.json";

/** English templates of the file reading messages. The UI translates them by key (`messages.<key>`). */
const fileMessages = {
    invalidJson: "The file is not valid JSON.",
    invalidTemplateFile: "The template file is invalid:\n{{details}}",
    invalidSaveFile: "The save file is invalid:\n{{details}}",
    unknownFileFormat: "This is not a Game Item Tracker file (expected a template or a save).",
} as const;

/** The code of a file reading message. */
type FileMessageCode = keyof typeof fileMessages;

/** The result of reading a file. */
type ParsedFile =
    | { kind: "template"; template: Template }
    | { kind: "save"; save: Save }
    | ({ kind: "error" } & LocalizedMessage<FileMessageCode>);

const fileError = (code: FileMessageCode, details?: string): ParsedFile => ({
    kind: "error",
    ...createMessage(fileMessages, code, details === undefined ? undefined : { details }),
});

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
        return fileError("invalidJson");
    }
    const format = typeof json === "object" && json !== null ? (json as { format?: unknown }).format : undefined;
    if (format === templateFormat) {
        const result = templateSchema.safeParse(json);
        return result.success
            ? { kind: "template", template: result.data }
            : fileError("invalidTemplateFile", formatIssues(result.error));
    }
    if (format === saveFormat) {
        const result = saveSchema.safeParse(json);
        return result.success
            ? { kind: "save", save: result.data }
            : fileError("invalidSaveFile", formatIssues(result.error));
    }
    return fileError("unknownFileFormat");
};

/** Creates a file name such as "palia-fish.gitemplate.json". */
const fileNameFor = (kind: "template" | "save", name: string) =>
    `${slugify(name)}${kind === "template" ? templateExtension : saveExtension}`;

/** Serializes a template or save into file text. */
const serialize = (value: Template | Save) => JSON.stringify(value, null, 2);

export type { FileMessageCode, ParsedFile };
export { fileMessages, fileNameFor, parseFileText, saveExtension, serialize, templateExtension };
