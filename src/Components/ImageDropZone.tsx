import { faImage } from "@fortawesome/free-regular-svg-icons";
import { faPaste, faTrash, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { App, Button } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { canReadClipboard, dragHasFiles, imageFromDataTransfer, readClipboardImage } from "../Images/ImageInput.ts";
import { translateError } from "../Localization/Messages.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { ImagePreviewDialog } from "./ImagePreviewDialog.tsx";

type Props = {
    /** The current image as a data URL. */
    image?: string;
    onAccept: (imageId: string, dataUrl: string) => void;
    onRemove: () => void;
} & BaseProps;

/**
 * Adds an image by file open, drag and drop or clipboard paste (Ctrl+V anywhere while mounted,
 * or the Paste button). Every image goes through the preview dialog before it is resized and stored.
 */
let ImageDropZone = ({ className, image, onAccept, onRemove }: Props) => {
    const [pending, setPending] = React.useState<File | null>(null);
    const [dragging, setDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const { message } = App.useApp();
    const { t } = useTranslation();

    React.useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const file = imageFromDataTransfer(event.clipboardData);
            if (file) {
                event.preventDefault();
                setPending(file);
            }
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, []);

    const pasteClick = async () => {
        try {
            const file = await readClipboardImage();
            if (file) {
                setPending(file);
            } else {
                void message.info(t("image.noClipboardImage"));
            }
        } catch (e) {
            void message.warning(translateError(t, e));
        }
    };

    return (
        <div className={classNames(className, "ImageDropZone")}>
            <div
                className={classNames("ImageDropZone-area", { "ImageDropZone-dragging": dragging })}
                data-testid="image-drop-zone"
                onDragOver={e => {
                    if (dragHasFiles(e.dataTransfer)) {
                        e.preventDefault();
                        setDragging(true);
                    }
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const file = imageFromDataTransfer(e.dataTransfer);
                    if (file) {
                        setPending(file);
                    } else {
                        void message.warning(t("image.dropImageFile"));
                    }
                }}
            >
                {image ? (
                    <img src={image} alt={t("image.itemImage")} className="ImageDropZone-image" />
                ) : (
                    <FontAwesomeIcon icon={faImage} className="ImageDropZone-placeholder" />
                )}
                <div className="ImageDropZone-hint">{t("image.hint")}</div>
            </div>
            <div className="ImageDropZone-buttons">
                <Button
                    size="small"
                    icon={<FontAwesomeIcon icon={faUpload} />}
                    onClick={() => inputRef.current?.click()}
                >
                    {t("image.choose")}
                </Button>
                {canReadClipboard() && (
                    <Button size="small" icon={<FontAwesomeIcon icon={faPaste} />} onClick={pasteClick}>
                        {t("image.paste")}
                    </Button>
                )}
                {image && (
                    <Button size="small" danger icon={<FontAwesomeIcon icon={faTrash} />} onClick={onRemove}>
                        {t("common.remove")}
                    </Button>
                )}
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                hidden
                data-testid="image-file-input"
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                        setPending(file);
                    }
                    e.target.value = "";
                }}
            />
            <ImagePreviewDialog
                file={pending}
                onCancel={() => setPending(null)}
                onAccept={(id, dataUrl) => {
                    setPending(null);
                    onAccept(id, dataUrl);
                }}
            />
        </div>
    );
};

ImageDropZone = styled(ImageDropZone)`
    display: flex;
    flex-direction: column;
    gap: 6px;
    .ImageDropZone-area {
        border: 1px dashed #8888;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-height: 120px;
        justify-content: center;
    }
    .ImageDropZone-dragging {
        border-color: #1677ff;
        background: #1677ff14;
    }
    .ImageDropZone-image {
        max-width: 128px;
        max-height: 128px;
    }
    .ImageDropZone-placeholder {
        font-size: 40px;
        opacity: 0.3;
    }
    .ImageDropZone-hint {
        font-size: 0.8em;
        opacity: 0.7;
    }
    .ImageDropZone-buttons {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }
    // The antd Form styles show file inputs with display: block, which overrides the hidden attribute.
    input[type="file"][hidden] {
        display: none;
    }
`;

export { ImageDropZone };
