import {
    faChevronDown,
    faDownload,
    faEye,
    faEyeSlash,
    faListCheck,
    faRightLeft,
    faSquareCheck,
    faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, App, Badge, Button, Dropdown, Empty, Modal, Popconfirm, Space, Spin, Table, Tooltip } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { ItemBrowser } from "../Components/ItemBrowser.tsx";
import { ItemCard } from "../Components/ItemCard.tsx";
import { setCounterForItems } from "../Domain/BulkEdits.ts";
import { getSaveItem, setCounterValue, setObtained } from "../Domain/Counters.ts";
import {
    type ExchangeEntry,
    type ExchangeMode,
    groupEntriesByItem,
    pruneEntries,
    suggestAmount,
    toggleEntry,
} from "../Domain/Exchange.ts";
import { setHiddenForItems } from "../Domain/HiddenItems.ts";
import { compareVersions } from "../Domain/Ids.ts";
import {
    clearGathered,
    getMaterialNeeds,
    getMaterialsLabel,
    hasMaterialsList,
    isMaterialComplete,
    setGathered,
} from "../Domain/Materials.ts";
import { removeSaveItems } from "../Domain/UpgradeSave.ts";
import { downloadFile, fileNameFor, serialize } from "../Files/FileIo.ts";
import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getSave, getTemplate, listTemplateVersions, putSave } from "../Storage/Database.ts";
import { useAutosave } from "../Storage/UseAutosave.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { ExchangePanel, type ExchangeUpdate, getStoredGiveSource } from "./ExchangePanel.tsx";
import { MaterialsPanel } from "./MaterialsPanel.tsx";
import { SaveItemDrawer } from "./SaveItemDrawer.tsx";
import { type SetCounterChoice, SetCounterDialog } from "./SetCounterDialog.tsx";
import { UpgradeDialog } from "./UpgradeDialog.tsx";

type Props = {
    saveId: string | null;
    onOpenLibrary: () => void;
    /** The exchange list of the open save (kept in memory by the app, never stored). */
    exchangeEntries?: ExchangeEntry[];
    /** Updates the exchange list of a save. */
    onExchangeChange?: (saveId: string, update: (entries: ExchangeEntry[]) => ExchangeEntry[]) => void;
} & BaseProps;

const noEntries: ExchangeEntry[] = [];

/** The editor of the user's own item data (a save). */
let InventoryEditor = ({ className, saveId, onOpenLibrary, exchangeEntries, onExchangeChange }: Props) => {
    const [save, setSave] = React.useState<Save | null>(null);
    const [template, setTemplate] = React.useState<Template | null>(null);
    const [newer, setNewer] = React.useState<Template | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [openItemId, setOpenItemId] = React.useState<string | null>(null);
    const [upgradeOpen, setUpgradeOpen] = React.useState(false);
    const [removedOpen, setRemovedOpen] = React.useState(false);
    const [exchangeOpen, setExchangeOpen] = React.useState(false);
    const [materialsOpen, setMaterialsOpen] = React.useState(false);
    const visibleItems = React.useRef<Template["items"]>([]);
    const [selecting, setSelecting] = React.useState(false);
    const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
    const [setCounterOpen, setSetCounterOpen] = React.useState(false);
    const lastSelected = React.useRef<string | null>(null);
    const { t } = useTranslation();
    const { message } = App.useApp();

    // The error texts are translated when the save is opened; changing the language does not reload it.
    // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when another save is opened
    React.useEffect(() => {
        let cancelled = false;
        setSave(null);
        setTemplate(null);
        setNewer(null);
        setError(null);
        setSelecting(false);
        setSelected(new Set());
        lastSelected.current = null;
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
            const item = template.items.find(i => i.id === itemId);
            updateItem(itemId, s => setCounterValue(template, s, variantKey, counterKey, value, item));
        },
        [template, updateItem]
    );

    const onObtainedChange = React.useCallback(
        (itemId: string, variantKey: string, obtained: boolean) => {
            updateItem(itemId, s => setObtained(s, variantKey, obtained));
        },
        [updateItem]
    );

    // The exchange list: entries that no longer fit the template (e.g. after an upgrade) are left out.
    const rawEntries = exchangeEntries ?? noEntries;
    const entries = React.useMemo(
        () => (template ? pruneEntries(template, rawEntries) : rawEntries),
        [template, rawEntries]
    );
    const entryGroupsRef = React.useRef<Map<string, ExchangeEntry[]>>(new Map());
    const entryGroups = React.useMemo(() => {
        entryGroupsRef.current = groupEntriesByItem(entries, entryGroupsRef.current);
        return entryGroupsRef.current;
    }, [entries]);

    const updateExchange = React.useCallback<ExchangeUpdate>(
        update => {
            if (saveId && template) {
                onExchangeChange?.(saveId, list => update(pruneEntries(template, list)));
            }
        },
        [saveId, template, onExchangeChange]
    );

    // The latest save for the toggle callback, so that cards do not re-render on every counter change.
    const saveRef = React.useRef(save);
    saveRef.current = save;

    const onExchangeToggle = React.useCallback(
        (itemId: string, variantKey: string, mode: ExchangeMode) => {
            const current = saveRef.current;
            const item = template?.items.find(i => i.id === itemId);
            if (!current || !template || !item) {
                return;
            }
            const amount = suggestAmount(
                template,
                item,
                current.items[itemId],
                variantKey,
                mode,
                getStoredGiveSource()
            );
            updateExchange(list => toggleEntry(list, { itemId, variantKey, mode, amount }));
        },
        [template, updateExchange]
    );

    const onGatheredChange = React.useCallback((materialId: string, value: number) => {
        setSave(s => (s ? setGathered(s, materialId, value) : s));
    }, []);

    const onClearGathered = React.useCallback(() => {
        setSave(s => (s ? clearGathered(s) : s));
    }, []);

    // The number of materials still short, shown on the toolbar button.
    const materialsShort = React.useMemo(
        () =>
            template && save && hasMaterialsList(template)
                ? getMaterialNeeds(template, save).filter(n => n.needed > 0 && !isMaterialComplete(n)).length
                : 0,
        [template, save]
    );

    const onItemsChange = React.useCallback((items: Template["items"]) => {
        visibleItems.current = items;
    }, []);

    // Selection: a click toggles one item. A shift-click gives the shown items from the last clicked one to this one
    // the new state of this one.
    const onSelect = React.useCallback((itemId: string, range: boolean) => {
        const shown = visibleItems.current;
        const from = range && lastSelected.current ? shown.findIndex(i => i.id === lastSelected.current) : -1;
        const to = shown.findIndex(i => i.id === itemId);
        const ids =
            from >= 0 && to >= 0 ? shown.slice(Math.min(from, to), Math.max(from, to) + 1).map(i => i.id) : [itemId];
        lastSelected.current = itemId;
        setSelected(current => {
            const select = !current.has(itemId);
            const next = new Set(current);
            for (const id of ids) {
                if (select) {
                    next.add(id);
                } else {
                    next.delete(id);
                }
            }
            return next;
        });
    }, []);

    const selectShown = () => setSelected(current => new Set([...current, ...visibleItems.current.map(i => i.id)]));

    const clearSelection = () => {
        setSelected(new Set());
        lastSelected.current = null;
    };

    const applySetCounter = (choice: SetCounterChoice) => {
        if (!template || !save) {
            return;
        }
        const result = setCounterForItems(template, save, selected, choice.counterKey, choice.value, choice.variantKey);
        setSave(result.save);
        setSetCounterOpen(false);
        message.success(
            t("selection.applied", {
                counter: template.counterDefs.find(c => c.key === choice.counterKey)?.label ?? choice.counterKey,
                count: result.changed.length,
            })
        );
    };

    // Hidden items move to the Hidden category (and shown ones back), so they leave the grid: the selection is cleared.
    const applyHidden = (hidden: boolean) => {
        if (!template || !save) {
            return;
        }
        const result = setHiddenForItems(template, save, selected, hidden);
        setSave(result.save);
        clearSelection();
        message.success(
            t(hidden ? "selection.hiddenDone" : "selection.unhiddenDone", { count: result.changed.length })
        );
    };

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
                    exchangeEntries={exchangeOpen ? (entryGroups.get(item.id) ?? noEntries) : undefined}
                    onExchangeToggle={exchangeOpen ? onExchangeToggle : undefined}
                    selected={selecting ? selected.has(item.id) : undefined}
                    onSelect={selecting ? onSelect : undefined}
                />
            ) : null,
        [
            template,
            save,
            onCounterChange,
            onObtainedChange,
            exchangeOpen,
            entryGroups,
            onExchangeToggle,
            selecting,
            selected,
            onSelect,
        ]
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
                {selecting && (
                    <div className="InventoryEditor-selection" role="toolbar" aria-label={t("selection.toggle")}>
                        <span className="InventoryEditor-selectionCount">
                            {t("selection.selected", { count: selected.size })}
                        </span>
                        <Button type="primary" disabled={selected.size === 0} onClick={() => setSetCounterOpen(true)}>
                            {t("selection.setCounter")}
                        </Button>
                        <Tooltip title={t("selection.hideTooltip")}>
                            <Button
                                disabled={selected.size === 0}
                                icon={<FontAwesomeIcon icon={faEyeSlash} />}
                                onClick={() => applyHidden(true)}
                            >
                                {t("selection.hide")}
                            </Button>
                        </Tooltip>
                        <Tooltip title={t("selection.unhideTooltip")}>
                            <Button
                                disabled={selected.size === 0}
                                icon={<FontAwesomeIcon icon={faEye} />}
                                onClick={() => applyHidden(false)}
                            >
                                {t("selection.unhide")}
                            </Button>
                        </Tooltip>
                        <Tooltip title={t("selection.selectShownTooltip")}>
                            <Button onClick={selectShown}>{t("selection.selectShown")}</Button>
                        </Tooltip>
                        <Button disabled={selected.size === 0} onClick={clearSelection}>
                            {t("selection.clear")}
                        </Button>
                        <span className="InventoryEditor-selectionHint">{t("selection.hint")}</span>
                        <Button onClick={() => setSelecting(false)}>{t("selection.done")}</Button>
                    </div>
                )}
            </div>
            <div className="InventoryEditor-body">
                <ItemBrowser
                    template={template}
                    save={save}
                    renderCard={renderCard}
                    stateKey={`browser:save:${save.saveId}`}
                    onItemsChange={onItemsChange}
                    toolbarExtra={
                        <>
                            <Tooltip title={t("selection.toggleTooltip")}>
                                <Badge count={selecting ? 0 : selected.size} size="small" overflowCount={9999}>
                                    <Button
                                        type={selecting ? "primary" : "default"}
                                        aria-pressed={selecting}
                                        icon={<FontAwesomeIcon icon={faSquareCheck} />}
                                        onClick={() => setSelecting(s => !s)}
                                    >
                                        {t("selection.toggle")}
                                    </Button>
                                </Badge>
                            </Tooltip>
                            <Tooltip title={t("exchange.toggleTooltip")}>
                                <Badge count={entries.length} size="small" overflowCount={999}>
                                    <Button
                                        type={exchangeOpen ? "primary" : "default"}
                                        aria-pressed={exchangeOpen}
                                        icon={<FontAwesomeIcon icon={faRightLeft} />}
                                        onClick={() => {
                                            setExchangeOpen(o => !o);
                                            setMaterialsOpen(false);
                                        }}
                                    >
                                        {t("exchange.toggle")}
                                    </Button>
                                </Badge>
                            </Tooltip>
                            {hasMaterialsList(template) && (
                                <Tooltip title={t("materials.toggleTooltip")}>
                                    <Badge count={materialsShort} size="small" overflowCount={999}>
                                        <Button
                                            type={materialsOpen ? "primary" : "default"}
                                            aria-pressed={materialsOpen}
                                            icon={<FontAwesomeIcon icon={faListCheck} />}
                                            onClick={() => {
                                                setMaterialsOpen(o => !o);
                                                setExchangeOpen(false);
                                            }}
                                        >
                                            {getMaterialsLabel(template) ?? t("materials.toggle")}
                                        </Button>
                                    </Badge>
                                </Tooltip>
                            )}
                            <Space.Compact>
                                <Button
                                    icon={<FontAwesomeIcon icon={faDownload} />}
                                    onClick={() => void exportSave(false)}
                                >
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
                        </>
                    }
                />
                <ExchangePanel
                    open={exchangeOpen}
                    onClose={() => setExchangeOpen(false)}
                    template={template}
                    save={save}
                    entries={entries}
                    onChange={updateExchange}
                    getVisibleItems={() => visibleItems.current}
                />
                <MaterialsPanel
                    open={materialsOpen && hasMaterialsList(template)}
                    onClose={() => setMaterialsOpen(false)}
                    template={template}
                    save={save}
                    onGatheredChange={onGatheredChange}
                    onClear={onClearGathered}
                />
            </div>
            <SaveItemDrawer
                template={template}
                item={openItem}
                saveItem={openItem ? save.items[openItem.id] : undefined}
                onClose={() => setOpenItemId(null)}
                onChange={updateItem}
                onCounterChange={onCounterChange}
                onObtainedChange={onObtainedChange}
            />
            <SetCounterDialog
                open={setCounterOpen}
                template={template}
                save={save}
                itemIds={selected}
                onCancel={() => setSetCounterOpen(false)}
                onApply={applySetCounter}
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
    .InventoryEditor-body {
        display: flex;
        gap: 10px;
        flex: 1;
        min-height: 0;
        @media (max-width: 760px) {
            flex-direction: column;
        }
    }
    .InventoryEditor-selection {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border: 1px solid var(--ant-color-primary-border);
        background: var(--ant-color-primary-bg);
        border-radius: var(--ant-border-radius-lg);
    }
    .InventoryEditor-selectionCount {
        font-weight: 600;
    }
    .InventoryEditor-selectionHint {
        flex: 1;
        font-size: 0.85em;
        opacity: 0.7;
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
