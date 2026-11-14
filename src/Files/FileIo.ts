import { imageMessages } from "../Images/ImageMessages.ts";
import { LocalizedError } from "../Types/LocalizedMessage.ts";
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

/** The type of a file offered in the save dialog. */
type SaveFileType = { description: string; mime: string; extension: string };

/**
 * Lets the user save a blob as a file. Uses the File System Access API when available and falls back to a download.
 * @returns false when the user cancelled the save dialog.
 */
const downloadBlob = async (blob: Blob, fileName: string, type: SaveFileType): Promise<boolean> => {
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (picker) {
        try {
            const handle = await picker({
                suggestedName: fileName,
                types: [{ description: type.description, accept: { [type.mime]: [type.extension] } }],
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

/**
 * Lets the user save a template or save file. Uses the File System Access API when available and falls back to a download.
 * @returns false when the user cancelled the save dialog.
 */
const downloadFile = (text: string, fileName: string, kind: "template" | "save"): Promise<boolean> =>
    downloadBlob(new Blob([text], { type: "application/json" }), fileName, {
        description: kind === "template" ? "Game Item Tracker template" : "Game Item Tracker save",
        mime: "application/json",
        extension: kind === "template" ? templateExtension : saveExtension,
    });

/** Gets a value indicating whether the browser can write images to the clipboard. */
const canCopyImage = () =>
    typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && !!navigator.clipboard?.write;

/**
 * Writes a PNG image to the clipboard. Pass the promise of the image straight from the click handler:
 * Safari only allows clipboard writes that start inside the user gesture.
 */
const copyImageToClipboard = async (png: Blob | Promise<Blob>): Promise<void> => {
    if (!canCopyImage()) {
        throw new LocalizedError(imageMessages, "clipboardWriteUnsupported");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
};

/** Reads a user-selected file as text. */
const readFileText = (file: Blob): Promise<string> => file.text();

export type { ParsedFile, SaveFileType };
export {
    canCopyImage,
    copyImageToClipboard,
    downloadBlob,
    downloadFile,
    fileNameFor,
    parseFileText,
    readFileText,
    saveExtension,
    serialize,
    templateExtension,
};
