import { Alert, App, Button, Input, Modal, Space, Table, Tag, Typography } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type CatalogStatus, filterCatalog, getCatalogStatus } from "../Domain/Catalog.ts";
import { fetchCatalog, fetchCatalogTemplate, templateSubmissionUrl } from "../Files/OnlineCatalog.ts";
import { translateError } from "../Localization/Messages.ts";
import type { CatalogEntry } from "../Schemas/CatalogSchema.ts";
import { putTemplate } from "../Storage/Database.ts";

type Props = {
    open: boolean;
    /** The stored template versions, to show which online templates are installed or newer. */
    stored: readonly { templateId: string; version: string }[];
    onClose: () => void;
    /** Called after a template was stored. */
    onInstalled: () => void;
};

const entryKey = (entry: CatalogEntry) => `${entry.templateId}@${entry.version}`;

/** Formats a byte count as kB or MB in the given language. */
const formatSize = (bytes: number, language: string) => {
    const format = (value: number, unit: string) =>
        `${value.toLocaleString(language, { maximumFractionDigits: 1 })} ${unit}`;
    return bytes >= 1024 * 1024 ? format(bytes / (1024 * 1024), "MB") : format(Math.max(1, bytes / 1024), "kB");
};

/** Lists the templates of the online catalog and installs or updates them into the library. */
const OnlineTemplatesDialog = ({ open, stored, onClose, onInstalled }: Props) => {
    const [entries, setEntries] = React.useState<CatalogEntry[] | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [query, setQuery] = React.useState("");
    const [installing, setInstalling] = React.useState<string | null>(null);
    const { message } = App.useApp();
    const { t, i18n } = useTranslation();

    const load = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setEntries((await fetchCatalog()).templates);
        } catch (e) {
            setError(translateError(t, e));
        } finally {
            setLoading(false);
        }
    }, [t]);

    // Load the list every time the dialog opens, so newly published templates show up.
    React.useEffect(() => {
        if (open) {
            void load();
        }
    }, [open, load]);

    const install = async (entry: CatalogEntry, status: CatalogStatus) => {
        setInstalling(entryKey(entry));
        try {
            const template = await fetchCatalogTemplate(entry);
            await putTemplate(template, true);
            void message.success(
                t(status === "update" ? "online.updated" : "online.installed", {
                    name: template.name,
                    version: template.version,
                })
            );
            onInstalled();
        } catch (e) {
            void message.error(translateError(t, e));
        } finally {
            setInstalling(null);
        }
    };

    const actionFor = (entry: CatalogEntry) => {
        const status = getCatalogStatus(entry, stored);
        if (status === "installed") {
            return (
                <Button size="small" disabled>
                    {t("online.isInstalled")}
                </Button>
            );
        }
        return (
            <Button
                size="small"
                type={status === "older" ? "default" : "primary"}
                loading={installing === entryKey(entry)}
                disabled={installing !== null && installing !== entryKey(entry)}
                onClick={() => void install(entry, status)}
            >
                {status === "update" ? t("online.update", { version: entry.version }) : t("online.install")}
            </Button>
        );
    };

    return (
        <Modal
            open={open}
            title={t("online.title")}
            width={900}
            onCancel={onClose}
            footer={
                <Button type="primary" onClick={onClose}>
                    {t("common.close")}
                </Button>
            }
        >
            <Space orientation="vertical" style={{ width: "100%" }}>
                <Typography.Text type="secondary">
                    {t("online.hint")}{" "}
                    <Typography.Link href={templateSubmissionUrl} target="_blank" rel="noreferrer">
                        {t("online.shareLink")}
                    </Typography.Link>
                </Typography.Text>
                <Input.Search
                    allowClear
                    aria-label={t("online.search")}
                    placeholder={t("online.search")}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {error && (
                    <Alert
                        type="error"
                        showIcon
                        title={error}
                        action={
                            <Button size="small" onClick={() => void load()}>
                                {t("online.retry")}
                            </Button>
                        }
                    />
                )}
                <Table
                    size="small"
                    rowKey={entryKey}
                    loading={loading}
                    pagination={false}
                    dataSource={entries ? filterCatalog(entries, query) : []}
                    locale={{ emptyText: entries ? t("online.noMatches") : " " }}
                    columns={[
                        {
                            title: t("library.template"),
                            render: (_, entry) => {
                                const status = getCatalogStatus(entry, stored);
                                return (
                                    <>
                                        <div>
                                            {entry.name} {status === "older" && <Tag>{t("online.olderThanYours")}</Tag>}
                                        </div>
                                        <Typography.Text type="secondary" style={{ fontSize: "0.85em" }}>
                                            {t("online.details", {
                                                game: entry.game,
                                                count: entry.itemCount,
                                                size: formatSize(entry.size, i18n.language),
                                            })}
                                        </Typography.Text>
                                        {entry.description && (
                                            <div>
                                                <Typography.Text type="secondary" style={{ fontSize: "0.85em" }}>
                                                    {entry.description}
                                                </Typography.Text>
                                            </div>
                                        )}
                                    </>
                                );
                            },
                        },
                        { title: t("common.version"), render: (_, entry) => entry.version },
                        { title: "", render: (_, entry) => actionFor(entry), align: "right" },
                    ]}
                />
            </Space>
        </Modal>
    );
};

export { OnlineTemplatesDialog };
