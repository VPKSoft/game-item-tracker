import { faChevronDown, faDownload, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Button, Dropdown, Empty, Modal, Popconfirm, Space, Spin, Table } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { ItemBrowser } from "../Components/ItemBrowser.tsx";
import { ItemCard } from "../Components/ItemCard.tsx";
import { getSaveItem, setCounterValue, setObtained } from "../Domain/Counters.ts";
import { compareVersions } from "../Domain/Ids.ts";
import { removeSaveItems } from "../Domain/UpgradeSave.ts";
import { downloadFile, fileNameFor, serialize } from "../Files/FileIo.ts";
import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getSave, getTemplate, listTemplateVersions, putSave } from "../Storage/Database.ts";
import { useAutosave } from "../Storage/UseAutosave.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { SaveItemDrawer } from "./SaveItemDrawer.tsx";
import { UpgradeDialog } from "./UpgradeDialog.tsx";

type Props = {
    saveId: string | null;
    onOpenLibrary: () => void;
} & BaseProps;

/** The editor of the user's own item data (a save). */
let InventoryEditor = ({ className, saveId, onOpenLibrary }: Props) => {
    const [save, setSave] = React.useState<Save | null>(null);
    const [template, setTemplate] = React.useState<Template | null>(null);
    const [newer, setNewer] = React.useState<Template | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [openItemId, setOpenItemId] = React.useState<string | null>(null);
    const [upgradeOpen, setUpgradeOpen] = React.useState(false);
    const [removedOpen, setRemovedOpen] = React.useState(false);
    const { t } = useTranslation();

    // The error texts are translated when the save is opened; changing the language does not reload it.
    // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when another save is opened
    React.useEffect(() => {
        let cancelled = false;
        setSave(null);
        setTemplate(null);
        setNewer(null);
        setError(null);
        if (!saveId) {
            return;
        }
        setLoading(true);
        (async () => {
            const loaded = await getSave(saveId);
            if (!loaded) {
                throw new Error(t("inventory.saveNotFound"));
            }
            const loadedTemplate = await getTemplate(loaded.template.templateId, loaded.template.version);
            if (!loadedTemplate) {
                throw new Error(
                    t("inventory.templateMissing", { name: loaded.template.name, version: loaded.template.version })
                );
            }
            const versions = await listTemplateVersions(loaded.template.templateId);
            const newest = versions.sort((a, b) => compareVersions(b.version, a.version))[0];
            const newerTemplate =
                newest && compareVersions(newest.version, loaded.template.version) > 0
                    ? await getTemplate(newest.templateId, newest.version)
                    : undefined;
            if (!cancelled) {
                setSave(loaded);
                setTemplate(loadedTemplate);
                setNewer(newerTemplate ?? null);
            }
        })()
            .catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [saveId]);

    const flush = useAutosave(save, putSave);

    const updateItem = React.useCallback((itemId: string, update: (saveItem: SaveItem) => SaveItem) => {
        setSave(s =>
            s
                ? {
                      ...s,
                      updatedAt: new Date().toISOString(),
                      items: { ...s.items, [itemId]: update(getSaveItem(s, itemId)) },
                  }
                : s
        );
    }, []);

    const removeItems = React.useCallback((itemIds: string[]) => {
        setSave(s => (s ? removeSaveItems(s, itemIds) : s));
    }, []);

    const onCounterChange = React.useCallback(
        (itemId: string, variantKey: string, counterKey: string, value: number) => {
            if (!template) {
                return;
            }
            updateItem(itemId, s => setCounterValue(template, s, variantKey, counterKey, value));
        },
        [template, updateItem]
    );

    const onObtainedChange = React.useCallback(
        (itemId: string, variantKey: string, obtained: boolean) => {
            updateItem(itemId, s => setObtained(s, variantKey, obtained));
        },
        [updateItem]
    );

    const exportSave = async (withTemplate: boolean) => {
        if (!save || !template) {
            return;
        }
        flush();
        const content: Save = withTemplate ? { ...save, bundle: template } : save;
        if (await downloadFile(serialize(content), fileNameFor("save", save.name), "save")) {
            await putSave(save, true);
        }
    };

    const renderCard = React.useCallback(
        (item: Template["items"][number]) =>
            template && save ? (
                <ItemCard
                    template={template}
                    item={item}
                    saveItem={save.items[item.id]}
                    onCounterChange={onCounterChange}
                    onObtainedChange={onObtainedChange}
                    onOpen={setOpenItemId}
                    showCounters
                />
            ) : null,
        [template, save, onCounterChange, onObtainedChange]
    );

    if (!saveId) {
        return (
            <Empty className={className} description={t("inventory.noSaveOpen")}>
                <Button type="primary" onClick={onOpenLibrary}>
                    {t("common.openLibrary")}
                </Button>
            </Empty>
        );
    }
    if (loading) {
        return <Spin className={className} />;
    }
    if (error || !save || !template) {
        return (
            <div className={className}>
                <Alert type="error" title={error ?? t("inventory.couldNotOpen")} showIcon />
                <Button style={{ marginTop: 10 }} onClick={onOpenLibrary}>
                    {t("common.openLibrary")}
                </Button>
            </div>
        );
    }

    const orphans = Object.entries(save.items).filter(([, s]) => s.orphan);
    const openItem = openItemId ? template.items.find(i => i.id === openItemId) : undefined;

    return (
        <div className={classNames(className, "InventoryEditor")}>
            <div className="InventoryEditor-header">
                <div className="InventoryEditor-title">
                    {save.name}
                    <span className="InventoryEditor-subtitle">
                        {template.name} v{template.version}
                    </span>
                </div>
                {orphans.length > 0 && (
                    <Alert
                        type="warning"
                        showIcon
                        icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                        title={t("inventory.removedItemsBanner", { count: orphans.length })}
                        action={
                            <Button size="small" onClick={() => setRemovedOpen(true)}>
                                {t("inventory.review")}
                            </Button>
                        }
                    />
                )}
                {newer && (
                    <Alert
                        type="info"
                        showIcon
                        title={t("inventory.newerVersion", { version: newer.version })}
                        action={
                            <Button size="small" type="primary" onClick={() => setUpgradeOpen(true)}>
                                {t("inventory.upgrade")}
                            </Button>
                        }
                    />
                )}
            </div>
            <ItemBrowser
                template={template}
                save={save}
                renderCard={renderCard}
                stateKey={`browser:save:${save.saveId}`}
                toolbarExtra={
                    <Space.Compact>
                        <Button icon={<FontAwesomeIcon icon={faDownload} />} onClick={() => void exportSave(false)}>
                            {t("common.export")}
                        </Button>
                        <Dropdown
                            menu={{
                                items: [{ key: "bundle", label: t("common.exportWithTemplate") }],
                                onClick: () => void exportSave(true),
                            }}
                        >
                            <Button
                                aria-label={t("inventory.moreExportOptions")}
                                icon={<FontAwesomeIcon icon={faChevronDown} />}
                            />
                        </Dropdown>
                    </Space.Compact>
                }
            />
            <SaveItemDrawer
                template={template}
                item={openItem}
                saveItem={openItem ? save.items[openItem.id] : undefined}
                onClose={() => setOpenItemId(null)}
                onChange={updateItem}
                onCounterChange={onCounterChange}
                onObtainedChange={onObtainedChange}
            />
            <UpgradeDialog
                open={upgradeOpen}
                save={save}
                oldTemplate={template}
                newTemplate={newer ?? undefined}
                onCancel={() => setUpgradeOpen(false)}
                onUpgrade={(upgraded, upgradedTemplate) => {
                    setSave(upgraded);
                    setTemplate(upgradedTemplate);
                    setNewer(null);
                    setUpgradeOpen(false);
                }}
            />
            <Modal
                open={removedOpen && orphans.length > 0}
                title={t("inventory.removedItemsTitle")}
                onCancel={() => setRemovedOpen(false)}
                width={760}
                footer={
                    <Space>
                        <Popconfirm
                            title={t("inventory.removeAllTitle", { count: orphans.length })}
                            description={t("inventory.removeDescription")}
                            okText={t("common.remove")}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => {
                                removeItems(orphans.map(([id]) => id));
                                setRemovedOpen(false);
                            }}
                        >
                            <Button danger>{t("inventory.removeAll")}</Button>
                        </Popconfirm>
                        <Button onClick={() => setRemovedOpen(false)}>{t("common.close")}</Button>
                    </Space>
                }
            >
                <p>{t("inventory.removedItemsDescription")}</p>
                <Table
                    size="small"
                    rowKey={([id]) => id}
                    pagination={false}
                    dataSource={orphans}
                    columns={[
                        { title: t("common.item"), render: (_, [id, s]) => s.orphan?.name ?? id },
                        {
                            title: t("inventory.removedIn"),
                            render: (_, [, s]) => (s.orphan?.removedIn ? `v${s.orphan.removedIn}` : ""),
                        },
                        {
                            title: t("inventory.amounts"),
                            render: (_, [, s]) =>
                                Object.entries(s.counts)
                                    .flatMap(([variant, values]) =>
                                        Object.entries(values)
                                            .filter(([, v]) => v > 0)
                                            .map(([k, v]) => `${variant === "_" ? "" : `${variant} `}${k}: ${v}`)
                                    )
                                    .concat(
                                        (s.obtained ?? []).map(
                                            v => `${v === "_" ? "" : `${v} `}${t("inventory.obtained")}`
                                        )
                                    )
                                    .join(", "),
                        },
                        { title: t("common.notes"), render: (_, [, s]) => s.notes },
                        {
                            title: "",
                            render: (_, [id, s]) => (
                                <Popconfirm
                                    title={t("inventory.removeTitle", { name: s.orphan?.name ?? id })}
                                    description={t("inventory.removeDescription")}
                                    okText={t("common.remove")}
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() => removeItems([id])}
                                >
                                    <Button size="small" danger>
                                        {t("common.remove")}
                                    </Button>
                                </Popconfirm>
                            ),
                        },
                    ]}
                />
            </Modal>
        </div>
    );
};

InventoryEditor = styled(InventoryEditor)`
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    min-height: 0;
    .InventoryEditor-header {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .InventoryEditor-title {
        font-size: 1.2em;
        font-weight: 600;
    }
    .InventoryEditor-subtitle {
        font-size: 0.75em;
        font-weight: 400;
        opacity: 0.7;
        margin-left: 10px;
    }
`;

export { InventoryEditor };
