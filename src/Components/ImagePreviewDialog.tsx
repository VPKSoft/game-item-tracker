import { Alert, Modal } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { computeTargetSize, hashImage, resizeImage, validateImageFile } from "../Images/ImageResize.ts";
import { translateError, translateMessage } from "../Localization/Messages.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";

type Props = {
    /** The image waiting for acceptance; null closes the dialog. */
    file: File | null;
    onAccept: (imageId: string, dataUrl: string) => void;
    onCancel: () => void;
} & BaseProps;

const formatBytes = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Shows an added image before it is stored. The image is resized only when the user accepts it.
 */
let ImagePreviewDialog = ({ className, file, onAccept, onCancel }: Props) => {
    const [url, setUrl] = React.useState<string | null>(null);
    const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const { t } = useTranslation();

    // biome-ignore lint/correctness/useExhaustiveDependencies: validate only when another file is given
    React.useEffect(() => {
        setSize(null);
        const problem = file ? validateImageFile(file) : null;
        setError(problem ? translateMessage(t, problem) : null);
        if (!file) {
            setUrl(null);
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    const target = size ? computeTargetSize(size.width, size.height) : null;

    const accept = async () => {
        if (!file) {
            return;
        }
        setBusy(true);
        try {
            const resized = await resizeImage(file);
            onAccept(await hashImage(resized.blob), resized.dataUrl);
        } catch (e) {
            setError(translateError(t, e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={file !== null}
            title={t("image.addImage")}
            okText={t("image.accept")}
            onOk={accept}
            onCancel={onCancel}
            okButtonProps={{ disabled: !!error || !size, loading: busy }}
            destroyOnHidden
        >
            <div className={classNames(className, "ImagePreviewDialog")}>
                {file && url && !validateImageFile(file) && (
                    <img
                        className="ImagePreviewDialog-image"
                        src={url}
                        alt={t("image.preview")}
                        onLoad={e =>
                            setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                        }
                        onError={() => setError(t("image.couldNotRead"))}
                    />
                )}
                {file && (
                    <div className="ImagePreviewDialog-info">
                        <div>
                            {t("image.original", {
                                size: `${size ? `${size.width} × ${size.height} px, ` : ""}${formatBytes(file.size)}`,
                            })}
                        </div>
                        {target && <div>{t("image.storedAs", { width: target.width, height: target.height })}</div>}
                    </div>
                )}
                {error && <Alert type="error" title={error} showIcon />}
            </div>
        </Modal>
    );
};

ImagePreviewDialog = styled(ImagePreviewDialog)`
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    .ImagePreviewDialog-image {
        max-width: 100%;
        max-height: 300px;
        object-fit: contain;
        background: repeating-conic-gradient(#8882 0% 25%, transparent 0% 50%) 50% / 16px 16px;
    }
    .ImagePreviewDialog-info {
        font-size: 0.9em;
        text-align: center;
    }
`;

export { ImagePreviewDialog };
