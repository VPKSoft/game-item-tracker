import { faFileImport, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { createSave, createTemplate } from "../Domain/CreateSave.ts";
import { compareVersions } from "../Domain/Ids.ts";
import {
    downloadFile,
    fileNameFor,
    parseFileText,
    readFileText,
    saveExtension,
    serialize,
    templateExtension,
} from "../Files/FileIo.ts";
import { translateMessage } from "../Localization/Messages.ts";
import {
    deleteSave,
    deleteTemplate,
    getSave,
    getTemplate,
    listSaves,
    listTemplates,
    putSave,
    putTemplate,
    type SaveSummary,
    type TemplateSummary,
} from "../Storage/Database.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import type { TemplateKey } from "./TemplateEditor.tsx";

type Props = {
    onOpenSave: (saveId: string) => void;
    onOpenTemplate: (key: TemplateKey) => void;
} & BaseProps;

const notBackedUp = (summary: { updatedAt: string; lastExportedAt?: string }) =>
    !summary.lastExportedAt || summary.lastExportedAt < summary.updatedAt;

/** Lists the stored templates and saves; imports, exports, creates and deletes them. */
let Library = ({ className, onOpenSave, onOpenTemplate }: Props) => {
    const [templates, setTemplates] = React.useState<TemplateSummary[]>([]);
    const [saves, setSaves] = React.useState<SaveSummary[]>([]);
    const [newSaveFor, setNewSaveFor] = React.useState<TemplateSummary | null>(null);
    const [newSaveName, setNewSaveName] = React.useState("");
    const [newTemplateOpen, setNewTemplateOpen] = React.useState(false);
    const [newTemplate, setNewTemplate] = React.useState({ name: "", game: "" });
    const [importError, setImportError] = React.useState<string | null>(null);
    const fileInput = React.useRef<HTMLInputElement>(null);
    const { message, modal } = App.useApp();
    const { t, i18n } = useTranslation();

    const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString(i18n.language) : t("library.never"));

    const refresh = React.useCallback(async () => {
        const [t, s] = await Promise.all([listTemplates(), listSaves()]);
        setTemplates(t.sort((a, b) => a.name.localeCompare(b.name) || compareVersions(b.version, a.version)));
        setSaves(s.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }, []);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const importFiles = async (files: FileList | null) => {
        setImportError(null);
        for (const file of Array.from(files ?? [])) {
            const parsed = parseFileText(await readFileText(file));
            if (parsed.kind === "error") {
                setImportError(`${file.name}: ${translateMessage(t, parsed)}`);
                continue;
            }
            if (parsed.kind === "template") {
                const template = parsed.template;
                const existing = await getTemplate(template.templateId, template.version);
                if (existing) {
                    const overwrite = await new Promise<boolean>(resolve =>
                        modal.confirm({
                            title: t("library.replaceTemplateTitle", {
                                name: template.name,
                                version: template.version,
                            }),
                            content: t("library.replaceTemplateContent"),
                            okText: t("common.replace"),
                            onOk: () => resolve(true),
                            onCancel: () => resolve(false),
                        })
                    );
                    if (!overwrite) {
                        continue;
                    }
                }
                await putTemplate(template, true);
                void message.success(t("library.importedTemplate", { name: template.name, version: template.version }));
            } else {
                const s = parsed.save;
                if (s.bundle && !(await getTemplate(s.bundle.templateId, s.bundle.version))) {
                    await putTemplate(s.bundle, true);
                }
                const existing = await getSave(s.saveId);
                if (existing) {
                    const overwrite = await new Promise<boolean>(resolve =>
                        modal.confirm({
                            title: t("library.replaceSaveTitle", { name: existing.name }),
                            content: t("library.replaceSaveContent", {
                                stored: formatDate(existing.updatedAt),
                                file: formatDate(s.updatedAt),
                            }),
                            okText: t("common.replace"),
                            onOk: () => resolve(true),
                            onCancel: () => resolve(false),
                        })
                    );
                    if (!overwrite) {
                        continue;
                    }
                }
                await putSave(s, true);
                if (!(await getTemplate(s.template.templateId, s.template.version))) {
                    setImportError(
                        t("library.importedSaveTemplateMissing", {
                            file: file.name,
                            name: s.template.name,
                            version: s.template.version,
                        })
                    );
                } else {
                    void message.success(t("library.importedSave", { name: s.name }));
                }
            }
        }
        await refresh();
    };

    const exportTemplate = async (summary: TemplateSummary) => {
        const template = await getTemplate(summary.templateId, summary.version);
        if (template && (await downloadFile(serialize(template), fileNameFor("template", template.name), "template"))) {
            await putTemplate(template, true);
            await refresh();
        }
    };

    const exportSave = async (summary: SaveSummary, withTemplate: boolean) => {
        const s = await getSave(summary.saveId);
        if (!s) {
            return;
        }
        const template = withTemplate ? await getTemplate(s.template.templateId, s.template.version) : undefined;
        if (
            await downloadFile(
                serialize(template ? { ...s, bundle: template } : s),
                fileNameFor("save", s.name),
                "save"
            )
        ) {
            await putSave(s, true);
            await refresh();
        }
    };

    const createNewSave = async () => {
        if (!newSaveFor) {
            return;
        }
        const template = await getTemplate(newSaveFor.templateId, newSaveFor.version);
        if (!template) {
            return;
        }
        const save = createSave(template, newSaveName.trim() || template.name);
        await putSave(save);
        setNewSaveFor(null);
        onOpenSave(save.saveId);
    };

    const createNewTemplate = async () => {
        const template = createTemplate(newTemplate.name.trim(), newTemplate.game.trim());
        await putTemplate(template);
        setNewTemplateOpen(false);
        onOpenTemplate({ templateId: template.templateId, version: template.version });
    };

    const newestVersion = (templateId: string) =>
        templates
            .filter(summary => summary.templateId === templateId)
            .sort((a, b) => compareVersions(b.version, a.version))[0]?.version;

    return (
        <div className={classNames(className, "Library")}>
            <Space wrap>
                <Button
                    type="primary"
                    icon={<FontAwesomeIcon icon={faFileImport} />}
                    onClick={() => fileInput.current?.click()}
                >
                    {t("library.importFile")}
                </Button>
                <Button icon={<FontAwesomeIcon icon={faPlus} />} onClick={() => setNewTemplateOpen(true)}>
                    {t("library.newTemplate")}
                </Button>
                <span style={{ opacity: 0.7, fontSize: "0.85em" }}>
                    {t("library.filesHint", { templateExtension, saveExtension })}
                </span>
            </Space>
            <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept=".json,application/json"
                data-testid="library-file-input"
                onChange={e => {
                    void importFiles(e.target.files);
                    e.target.value = "";
                }}
            />
            {importError && (
                <Alert type="error" showIcon closable title={importError} onClose={() => setImportError(null)} />
            )}

            <Card size="small" title={t("library.savesTitle")}>
                <Table
                    size="small"
                    rowKey="saveId"
                    pagination={false}
                    dataSource={saves}
                    locale={{ emptyText: t("library.noSaves") }}
                    columns={[
                        {
                            title: t("common.name"),
                            render: (_, s) => (
                                <Button type="link" onClick={() => onOpenSave(s.saveId)} style={{ padding: 0 }}>
                                    {s.name}
                                </Button>
                            ),
                        },
                        {
                            title: t("library.template"),
                            render: (_, s) => {
                                const newest = newestVersion(s.template.templateId);
                                return (
                                    <>
                                        {s.template.name} v{s.template.version}{" "}
                                        {newest && compareVersions(newest, s.template.version) > 0 && (
                                            <Tag color="blue">{t("library.newerAvailable", { version: newest })}</Tag>
                                        )}
                                        {!newest && <Tag color="error">{t("library.templateMissing")}</Tag>}
                                    </>
                                );
                            },
                        },
                        {
                            title: t("library.changed"),
                            render: (_, s) => (
                                <>
                                    {formatDate(s.updatedAt)}{" "}
                                    {notBackedUp(s) && (
                                        <Tooltip
                                            title={t("library.lastExported", { date: formatDate(s.lastExportedAt) })}
                                        >
                                            <Tag color="warning">{t("library.notExported")}</Tag>
                                        </Tooltip>
                                    )}
                                </>
                            ),
                        },
                        {
                            title: "",
                            render: (_, s) => (
                                <Space wrap>
                                    <Button size="small" onClick={() => onOpenSave(s.saveId)}>
                                        {t("common.open")}
                                    </Button>
                                    <Button size="small" onClick={() => void exportSave(s, false)}>
                                        {t("common.export")}
                                    </Button>
                                    <Button size="small" onClick={() => void exportSave(s, true)}>
                                        {t("common.exportWithTemplate")}
                                    </Button>
                                    <Popconfirm
                                        title={t("library.deleteSaveTitle")}
                                        description={t("library.deleteSaveDescription")}
                                        okText={t("common.delete")}
                                        okButtonProps={{ danger: true }}
                                        onConfirm={async () => {
                                            await deleteSave(s.saveId);
                                            await refresh();
                                        }}
                                    >
                                        <Button size="small" danger>
                                            {t("common.delete")}
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>

            <Card size="small" title={t("library.templatesTitle")}>
                <Table
                    size="small"
                    rowKey={row => `${row.templateId}@${row.version}`}
                    pagination={false}
                    dataSource={templates}
                    locale={{ emptyText: t("library.noTemplates", { extension: templateExtension }) }}
                    columns={[
                        { title: t("common.name"), render: (_, row) => row.name },
                        { title: t("common.game"), render: (_, row) => row.game },
                        { title: t("common.version"), render: (_, row) => row.version },
                        { title: t("common.items"), render: (_, row) => row.itemCount },
                        {
                            title: "",
                            render: (_, row) => (
                                <Space wrap>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={() => {
                                            setNewSaveName(row.name);
                                            setNewSaveFor(row);
                                        }}
                                    >
                                        {t("library.newSave")}
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() =>
                                            onOpenTemplate({ templateId: row.templateId, version: row.version })
                                        }
                                    >
                                        {t("common.edit")}
                                    </Button>
                                    <Button size="small" onClick={() => void exportTemplate(row)}>
                                        {t("common.export")}
                                    </Button>
                                    <Popconfirm
                                        title={t("library.deleteTemplateTitle")}
                                        description={
                                            saves.some(
                                                s =>
                                                    s.template.templateId === row.templateId &&
                                                    s.template.version === row.version
                                            )
                                                ? t("library.deleteTemplateUsed")
                                                : t("common.cannotBeUndone")
                                        }
                                        okText={t("common.delete")}
                                        okButtonProps={{ danger: true }}
                                        onConfirm={async () => {
                                            await deleteTemplate(row.templateId, row.version);
                                            await refresh();
                                        }}
                                    >
                                        <Button size="small" danger>
                                            {t("common.delete")}
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>

            <Modal
                open={newSaveFor !== null}
                title={t("library.newSaveTitle", { name: newSaveFor?.name })}
                okText={t("common.create")}
                onOk={() => void createNewSave()}
                onCancel={() => setNewSaveFor(null)}
            >
                <Input
                    aria-label={t("library.saveName")}
                    value={newSaveName}
                    onChange={e => setNewSaveName(e.target.value)}
                />
            </Modal>
            <Modal
                open={newTemplateOpen}
                title={t("library.newTemplate")}
                okText={t("common.create")}
                okButtonProps={{ disabled: !newTemplate.name.trim() }}
                onOk={() => void createNewTemplate()}
                onCancel={() => setNewTemplateOpen(false)}
            >
                <Form layout="vertical">
                    <Form.Item label={t("common.name")} required>
                        <Input
                            aria-label={t("library.newTemplateName")}
                            value={newTemplate.name}
                            onChange={e => setNewTemplate(n => ({ ...n, name: e.target.value }))}
                        />
                    </Form.Item>
                    <Form.Item label={t("common.game")}>
                        <Input
                            aria-label={t("library.newTemplateGame")}
                            value={newTemplate.game}
                            onChange={e => setNewTemplate(n => ({ ...n, game: e.target.value }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

Library = styled(Library)`
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    flex: 1;
    min-height: 0;
`;

export { Library };
