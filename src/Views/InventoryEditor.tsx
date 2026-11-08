import { faChevronDown, faDownload, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Button, Dropdown, Empty, Modal, Space, Spin, Table } from "antd";
import classNames from "classnames";
import * as React from "react";
import { styled } from "styled-components";
import { ItemBrowser } from "../Components/ItemBrowser.tsx";
import { ItemCard } from "../Components/ItemCard.tsx";
import { getSaveItem, setCounterValue, setObtained } from "../Domain/Counters.ts";
import { compareVersions } from "../Domain/Ids.ts";
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
    const [obsoleteOpen, setObsoleteOpen] = React.useState(false);

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
                throw new Error("The save was not found. It may have been deleted.");
            }
            const loadedTemplate = await getTemplate(loaded.template.templateId, loaded.template.version);
            if (!loadedTemplate) {
                throw new Error(
                    `The template "${loaded.template.name}" v${loaded.template.version} is missing. Import it in the Library.`
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
            <Empty className={className} description="No save is open">
                <Button type="primary" onClick={onOpenLibrary}>
                    Open the library
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
                <Alert type="error" title={error ?? "The save could not be opened."} showIcon />
                <Button style={{ marginTop: 10 }} onClick={onOpenLibrary}>
                    Open the library
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
                {newer && (
                    <Alert
                        type="info"
                        showIcon
                        title={`A newer template version (v${newer.version}) is available.`}
                        action={
                            <Button size="small" type="primary" onClick={() => setUpgradeOpen(true)}>
                                Upgrade…
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
                    <>
                        {orphans.length > 0 && (
                            <Button
                                icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                                onClick={() => setObsoleteOpen(true)}
                            >
                                Obsolete ({orphans.length})
                            </Button>
                        )}
                        <Space.Compact>
                            <Button icon={<FontAwesomeIcon icon={faDownload} />} onClick={() => void exportSave(false)}>
                                Export
                            </Button>
                            <Dropdown
                                menu={{
                                    items: [{ key: "bundle", label: "Export with template" }],
                                    onClick: () => void exportSave(true),
                                }}
                            >
                                <Button
                                    aria-label="More export options"
                                    icon={<FontAwesomeIcon icon={faChevronDown} />}
                                />
                            </Dropdown>
                        </Space.Compact>
                    </>
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
                open={obsoleteOpen}
                title="Obsolete items"
                footer={null}
                onCancel={() => setObsoleteOpen(false)}
                width={700}
            >
                <p>These items are no longer in the template. Their data is kept until you remove it.</p>
                <Table
                    size="small"
                    rowKey={([id]) => id}
                    pagination={false}
                    dataSource={orphans}
                    columns={[
                        { title: "Item", render: (_, [id, s]) => s.orphan?.name ?? id },
                        {
                            title: "Amounts",
                            render: (_, [, s]) =>
                                Object.entries(s.counts)
                                    .flatMap(([variant, values]) =>
                                        Object.entries(values).map(
                                            ([k, v]) => `${variant === "_" ? "" : `${variant} `}${k}: ${v}`
                                        )
                                    )
                                    .concat((s.obtained ?? []).map(v => `${v === "_" ? "" : `${v} `}obtained`))
                                    .join(", "),
                        },
                        { title: "Notes", render: (_, [, s]) => s.notes },
                        {
                            title: "",
                            render: (_, [id]) => (
                                <Button
                                    size="small"
                                    danger
                                    onClick={() =>
                                        setSave(s => {
                                            if (!s) {
                                                return s;
                                            }
                                            const { [id]: _removed, ...items } = s.items;
                                            return { ...s, items, updatedAt: new Date().toISOString() };
                                        })
                                    }
                                >
                                    Remove
                                </Button>
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
