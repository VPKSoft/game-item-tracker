import {
    fileNameFor,
    type ParsedFile,
    parseFileText,
    saveExtension,
    serialize,
    templateExtension,
} from "./FileFormat.ts";

type SaveFilePickerWindow = Window & {
    showSaveFilePicker?: (options: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
};

/**
 * Lets the user save a file. Uses the File System Access API when available and falls back to a download.
 * @returns false when the user cancelled the save dialog.
 */
const downloadFile = async (text: string, fileName: string, kind: "template" | "save"): Promise<boolean> => {
    const blob = new Blob([text], { type: "application/json" });
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
        try {
            const handle = await picker({
                suggestedName: fileName,
                types: [
                    {
                        description: kind === "template" ? "Game Item Tracker template" : "Game Item Tracker save",
                        accept: { "application/json": [kind === "template" ? templateExtension : saveExtension] },
                    },
                ],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return false;
            }
            // Fall through to the download fallback on other errors.
        }
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
};

/** Reads a user-selected file as text. */
const readFileText = (file: Blob): Promise<string> => file.text();

export type { ParsedFile };
export { downloadFile, fileNameFor, parseFileText, readFileText, saveExtension, serialize, templateExtension };
