/** English templates of the image handling messages. The UI translates them by key (`messages.<key>`). */
const imageMessages = {
    notAnImage: "The file is not an image.",
    imageTooLarge: "The image is too large ({{size}} MB). The maximum is 10 MB.",
    resizedImageTooLarge: "The resized image is too large to store.",
    resizeUnsupported: "Image resizing is not supported in this browser.",
    encodingFailed: "Encoding the image failed.",
    clipboardUnsupported: "Reading the clipboard is not supported here. Press Ctrl+V (Cmd+V) instead.",
    canvasUnsupported: "Drawing images is not supported in this browser.",
    clipboardWriteUnsupported: "Copying images is not supported in this browser. Save the PNG file instead.",
} as const;

/** The code of an image handling message. */
type ImageMessageCode = keyof typeof imageMessages;

export type { ImageMessageCode };
export { imageMessages };
