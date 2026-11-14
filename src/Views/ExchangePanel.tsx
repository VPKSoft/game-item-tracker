import { faImage } from "@fortawesome/free-regular-svg-icons";
import { faCopy, faDownload, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, App, Button, Empty, Input, Popconfirm, Segmented, Select, Space, Spin, theme } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { CounterStepper } from "../Components/CounterStepper.tsx";
import { findRoleCounter } from "../Domain/Counters.ts";
import {
    addSuggestedEntries,
    buildExchangeTiles,
    type ExchangeEntry,
    type ExchangeMode,
    exchangeModes,
    type GiveSource,
    getEntryKey,
    removeEntry,
    setEntryAmount,
} from "../Domain/Exchange.ts";
import { slugify } from "../Domain/Ids.ts";
import { canCopyImage, copyImageToClipboard, downloadBlob } from "../Files/FileIo.ts";
import {
    type ExchangeImageInput,
    type ExchangeImageTheme,
    renderExchangeImage,
} from "../Images/RenderExchangeImage.ts";
import { translateError } from "../Localization/Messages.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";

/** Updates the exchange list of the open save. */
type ExchangeUpdate = (update: (entries: ExchangeEntry[]) => ExchangeEntry[]) => void;

type Props = {
    open: boolean;
    onClose: () => void;
    template: Template;
    save: Save;
    entries: ExchangeEntry[];
    onChange: ExchangeUpdate;
    /** Gets the items the grid shows now (for quick fill). */
    getVisibleItems: () => TemplateItem[];
} & BaseProps;

/** Image options remembered in localStorage (a UI preference, not document data). */
type ExchangeOptions = {
    columns: number | null;
    theme: ExchangeImageTheme;
    scale: number;
    giveSource: GiveSource;
};

const optionsKey = "exchange:options";

const defaultOptions: ExchangeOptions = { columns: null, theme: "dark", scale: 1, giveSource: "surplus" };

const loadOptions = (): ExchangeOptions => {
    try {
        const raw = localStorage.getItem(optionsKey);
        return raw ? { ...defaultOptions, ...JSON.parse(raw) } : defaultOptions;
    } catch {
        return defaultOptions;
    }
};

/** The number of entries above which the panel warns about a tall image. */
const largeListSize = 150;

/**
 * The exchange list of a save: entries to give and to get, quick fill from the visible items, and the
 * image (preview, copy, save as PNG). The list itself is never stored.
 * Rendered as a side column next to the item grid (not an overlay), so the grid reflows to the remaining width.
 */
let ExchangePanel = ({ className, open, onClose, template, save, entries, onChange, getVisibleItems }: Props) => {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [options, setOptions] = React.useState<ExchangeOptions>(loadOptions);
    const [title, setTitle] = React.useState(save.name);
    const [preview, setPreview] = React.useState<string | null>(null);
    const [rendering, setRendering] = React.useState(false);
    const { token } = theme.useToken();

    React.useEffect(() => {
        setTitle(save.name);
    }, [save.name]);

    React.useEffect(() => {
        try {
            localStorage.setItem(optionsKey, JSON.stringify(options));
        } catch {
            // Storage can be unavailable; the options are just not remembered.
        }
    }, [options]);

    const hasRoles = !!findRoleCounter(template, "owned") && !!findRoleCounter(template, "target");
    const giveSource =
        options.giveSource === "surplus" || template.counterDefs.some(c => c.key === options.giveSource)
            ? options.giveSource
            : "surplus";

    const tiles = React.useMemo(() => buildExchangeTiles(template, entries), [template, entries]);

    const imageInput = React.useMemo<ExchangeImageInput>(
        () => ({
            title,
            headings: { give: t("exchange.canGive"), need: t("exchange.lookingFor") },
            tiles,
            theme: options.theme,
            columns: options.columns ?? undefined,
            scale: options.scale,
        }),
        [title, tiles, options.theme, options.columns, options.scale, t]
    );

    // The preview is redrawn shortly after the last change.
    React.useEffect(() => {
        if (!open || entries.length === 0) {
            setPreview(null);
            return;
        }
        let cancelled = false;
        let url: string | null = null;
        const timer = setTimeout(() => {
            setRendering(true);
            renderExchangeImage(imageInput)
                .then(blob => {
                    if (!cancelled) {
                        url = URL.createObjectURL(blob);
                        setPreview(url);
                    }
                })
                .catch(error => {
                    if (!cancelled) {
                        setPreview(null);
                        void message.error(t("exchange.renderFailed", { error: translateError(t, error) }));
                    }
                })
                .finally(() => !cancelled && setRendering(false));
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [open, entries.length, imageInput, message, t]);

    const fill = (mode: ExchangeMode) => {
        const result = addSuggestedEntries(entries, template, save, getVisibleItems(), mode, giveSource);
        if (result.added > 0) {
            onChange(() => result.entries);
            void message.success(t("exchange.added", { count: result.added }));
        } else {
            void message.info(t("exchange.nothingToAdd"));
        }
    };

    const copyImage = () => {
        // The promise goes to the clipboard inside the click; Safari requires that.
        copyImageToClipboard(renderExchangeImage(imageInput))
            .then(() => message.success(t("exchange.copied")))
            .catch(error => message.error(t("exchange.copyFailed", { error: translateError(t, error) })));
    };

    const savePng = async () => {
        try {
            const blob = await renderExchangeImage(imageInput);
            await downloadBlob(blob, `${slugify(title.trim() || save.name)}-exchange.png`, {
                description: t("exchange.pngDescription"),
                mime: "image/png",
                extension: ".png",
            });
        } catch (error) {
            void message.error(t("exchange.renderFailed", { error: translateError(t, error) }));
        }
    };

    const itemsById = React.useMemo(() => new Map(template.items.map(i => [i.id, i])), [template]);
    const variantLabels = React.useMemo(
        () => new Map(template.variantDefs.map(v => [v.key, v.label])),
        [template.variantDefs]
    );

    const entryName = (entry: ExchangeEntry) => {
        const name = itemsById.get(entry.itemId)?.name ?? entry.itemId;
        const variant = variantLabels.get(entry.variantKey);
        return variant ? `${name} (${variant})` : name;
    };

    const renderEntries = (mode: ExchangeMode) => {
        const list = entries.filter(e => e.mode === mode);
        if (list.length === 0) {
            return null;
        }
        return (
            <section className={`ExchangePanel-section ExchangePanel-${mode}`}>
                <h4>
                    {mode === "give" ? t("exchange.canGive") : t("exchange.lookingFor")} ({list.length})
                </h4>
                {list.map(entry => {
                    const key = getEntryKey(entry);
                    const item = itemsById.get(entry.itemId);
                    const image = item?.imageId ? template.images[item.imageId] : undefined;
                    const name = entryName(entry);
                    return (
                        <div key={key} className="ExchangePanel-entry">
                            <div className="ExchangePanel-thumb">
                                {image ? <img src={image} alt="" /> : <FontAwesomeIcon icon={faImage} />}
                            </div>
                            <div className="ExchangePanel-name" title={name}>
                                {name}
                            </div>
                            <CounterStepper
                                label={t("exchange.amount")}
                                value={entry.amount}
                                onChange={value => onChange(list => setEntryAmount(list, key, value))}
                            />
                            <Button
                                type="text"
                                size="small"
                                aria-label={t("exchange.removeEntry", { name })}
                                icon={<FontAwesomeIcon icon={faXmark} />}
                                onClick={() => onChange(list => removeEntry(list, key))}
                            />
                        </div>
                    );
                })}
            </section>
        );
    };

    if (!open) {
        return null;
    }

    return (
        <aside
            className={classNames(className, "ExchangePanel")}
            aria-label={t("exchange.title")}
            style={{
                background: token.colorBgContainer,
                borderColor: token.colorBorderSecondary,
                borderRadius: token.borderRadiusLG,
            }}
        >
            <div className="ExchangePanel-header" style={{ borderColor: token.colorBorderSecondary }}>
                <Button
                    type="text"
                    size="small"
                    aria-label={t("common.close")}
                    icon={<FontAwesomeIcon icon={faXmark} />}
                    onClick={onClose}
                />
                <div className="ExchangePanel-title">{t("exchange.title")}</div>
                <Popconfirm
                    title={t("exchange.clearTitle")}
                    okText={t("exchange.clear")}
                    onConfirm={() => onChange(() => [])}
                    disabled={entries.length === 0}
                >
                    <Button size="small" disabled={entries.length === 0}>
                        {t("exchange.clear")}
                    </Button>
                </Popconfirm>
            </div>
            <div className="ExchangePanel-content">
                <div className="ExchangePanel-hint">{t("exchange.notStored")}</div>

                <section className="ExchangePanel-section">
                    <h4>{t("exchange.fillTitle")}</h4>
                    <div className="ExchangePanel-hint">{t("exchange.fillHint")}</div>
                    {!hasRoles && <Alert type="info" showIcon title={t("exchange.noRoles")} />}
                    <Button block disabled={!hasRoles} onClick={() => fill("need")}>
                        {t("exchange.addMissing")}
                    </Button>
                    <Space.Compact block>
                        <Select
                            className="ExchangePanel-giveSource"
                            aria-label={t("exchange.giveSource")}
                            value={giveSource}
                            onChange={value => setOptions(o => ({ ...o, giveSource: value }))}
                            options={[
                                { value: "surplus", label: t("exchange.surplus") },
                                ...template.counterDefs.map(c => ({
                                    value: c.key,
                                    label: t("exchange.counterSource", { label: c.label }),
                                })),
                            ]}
                            popupMatchSelectWidth={false}
                        />
                        <Button onClick={() => fill("give")}>{t("exchange.addGive")}</Button>
                    </Space.Compact>
                </section>

                {entries.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("exchange.empty")} />
                ) : (
                    exchangeModes.map(mode => <React.Fragment key={mode}>{renderEntries(mode)}</React.Fragment>)
                )}

                {entries.length > 0 && (
                    <section className="ExchangePanel-section">
                        <h4>{t("exchange.preview")}</h4>
                        <Input
                            aria-label={t("exchange.imageTitle")}
                            placeholder={t("exchange.imageTitle")}
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            allowClear
                        />
                        <div className="ExchangePanel-options">
                            <label>
                                <span>{t("exchange.columns")}</span>
                                <Select
                                    aria-label={t("exchange.columns")}
                                    value={options.columns ?? 0}
                                    onChange={value => setOptions(o => ({ ...o, columns: value === 0 ? null : value }))}
                                    options={[
                                        { value: 0, label: t("exchange.auto") },
                                        ...Array.from({ length: 10 }, (_, i) => ({ value: i + 3, label: `${i + 3}` })),
                                    ]}
                                    popupMatchSelectWidth={false}
                                />
                            </label>
                            <label>
                                <span>{t("exchange.theme")}</span>
                                <Segmented<ExchangeImageTheme>
                                    value={options.theme}
                                    onChange={value => setOptions(o => ({ ...o, theme: value }))}
                                    options={[
                                        { value: "light", label: t("exchange.light") },
                                        { value: "dark", label: t("exchange.dark") },
                                    ]}
                                />
                            </label>
                            <label>
                                <span>{t("exchange.scale")}</span>
                                <Segmented<number>
                                    value={options.scale}
                                    onChange={value => setOptions(o => ({ ...o, scale: value }))}
                                    options={[
                                        { value: 1, label: "1×" },
                                        { value: 2, label: "2×" },
                                    ]}
                                />
                            </label>
                        </div>
                        {entries.length > largeListSize && (
                            <Alert type="warning" showIcon title={t("exchange.largeWarning")} />
                        )}
                        <div className="ExchangePanel-actions">
                            {canCopyImage() && (
                                <Button type="primary" icon={<FontAwesomeIcon icon={faCopy} />} onClick={copyImage}>
                                    {t("exchange.copyImage")}
                                </Button>
                            )}
                            <Button icon={<FontAwesomeIcon icon={faDownload} />} onClick={() => void savePng()}>
                                {t("exchange.savePng")}
                            </Button>
                        </div>
                        <Spin spinning={rendering}>
                            <div className="ExchangePanel-preview">
                                {preview && <img src={preview} alt={t("exchange.preview")} />}
                            </div>
                        </Spin>
                    </section>
                )}
            </div>
        </aside>
    );
};

ExchangePanel = styled(ExchangePanel)`
    width: 420px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-width: 1px;
    border-style: solid;
    @media (max-width: 760px) {
        width: auto;
        max-height: 50%;
    }
    .ExchangePanel-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom-width: 1px;
        border-bottom-style: solid;
    }
    .ExchangePanel-title {
        flex: 1;
        font-weight: 600;
        font-size: 1.1em;
    }
    .ExchangePanel-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 12px 16px 16px;
        overflow-y: auto;
        min-height: 0;
        flex: 1;
    }
    .ExchangePanel-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        h4 {
            margin: 0;
        }
    }
    .ExchangePanel-hint {
        font-size: 0.85em;
        opacity: 0.7;
    }
    .ExchangePanel-giveSource {
        flex: 1;
        min-width: 0;
    }
    .ExchangePanel-entry {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .ExchangePanel-thumb {
        width: 32px;
        height: 32px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        img {
            max-width: 32px;
            max-height: 32px;
        }
    }
    .ExchangePanel-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ExchangePanel-options {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        label {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 0.85em;
        }
    }
    .ExchangePanel-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .ExchangePanel-preview {
        min-height: 40px;
        img {
            max-width: 100%;
            display: block;
            border-radius: 4px;
        }
    }
`;

/** Gets the give amount source the user chose in the panel (remembered in localStorage). */
const getStoredGiveSource = (): GiveSource => loadOptions().giveSource;

export type { ExchangeUpdate };
export { ExchangePanel, getStoredGiveSource };
