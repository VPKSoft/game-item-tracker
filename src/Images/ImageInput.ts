/** Gets the first image file from a drag-and-drop or clipboard data transfer. */
const imageFromDataTransfer = (data: DataTransfer | null | undefined): File | null => {
    if (!data) {
        return null;
    }
    for (const file of Array.from(data.files ?? [])) {
        if (file.type.startsWith("image/")) {
            return file;
        }
    }
    for (const item of Array.from(data.items ?? [])) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
                return file;
            }
        }
    }
    return null;
};

/** Gets a value indicating whether the drag carries files (so the drop zone can highlight). */
const dragHasFiles = (data: DataTransfer | null | undefined) => !!data && Array.from(data.types).includes("Files");

/** Reads an image from the system clipboard with the async Clipboard API, when available. */
const readClipboardImage = async (): Promise<File | null> => {
    if (!navigator.clipboard?.read) {
        throw new Error("Reading the clipboard is not supported here. Press Ctrl+V (Cmd+V) instead.");
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) {
            const blob = await item.getType(type);
            return new File([blob], `pasted.${type.split("/")[1]}`, { type });
        }
    }
    return null;
};

/** Gets a value indicating whether the async clipboard read is available. */
const canReadClipboard = () => typeof navigator !== "undefined" && !!navigator.clipboard?.read;

export { canReadClipboard, dragHasFiles, imageFromDataTransfer, readClipboardImage };
