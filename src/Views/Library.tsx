import { faFileImport, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import classNames from "classnames";
import * as React from "react";
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

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "never");

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
                setImportError(`${file.name}: ${parsed.message}`);
                continue;
            }
            if (parsed.kind === "template") {
                const t = parsed.template;
                const existing = await getTemplate(t.templateId, t.version);
                if (existing) {
                    const overwrite = await new Promise<boolean>(resolve =>
                        modal.confirm({
                            title: `Replace ${t.name} v${t.version}?`,
                            content: "This template version is already in the library.",
                            okText: "Replace",
                            onOk: () => resolve(true),
                            onCancel: () => resolve(false),
                        })
                    );
                    if (!overwrite) {
                        continue;
                    }
                }
                await putTemplate(t, true);
                void message.success(`Imported template ${t.name} v${t.version}`);
            } else {
                const s = parsed.save;
                if (s.bundle && !(await getTemplate(s.bundle.templateId, s.bundle.version))) {
                    await putTemplate(s.bundle, true);
                }
                const existing = await getSave(s.saveId);
                if (existing) {
                    const overwrite = await new Promise<boolean>(resolve =>
                        modal.confirm({
                            title: `Replace the save "${existing.name}"?`,
                            content: `The stored save was changed ${formatDate(existing.updatedAt)}; the file is from ${formatDate(s.updatedAt)}.`,
                            okText: "Replace",
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
                        `${file.name}: imported, but its template "${s.template.name}" v${s.template.version} is missing. Import the template too.`
                    );
                } else {
                    void message.success(`Imported save ${s.name}`);
                }
            }
        }
        await refresh();
    };

    const exportTemplate = async (summary: TemplateSummary) => {
        const t = await getTemplate(summary.templateId, summary.version);
        if (t && (await downloadFile(serialize(t), fileNameFor("template", t.name), "template"))) {
            await putTemplate(t, true);
            await refresh();
        }
    };

    const exportSave = async (summary: SaveSummary, withTemplate: boolean) => {
        const s = await getSave(summary.saveId);
        if (!s) {
            return;
        }
        const t = withTemplate ? await getTemplate(s.template.templateId, s.template.version) : undefined;
        if (await downloadFile(serialize(t ? { ...s, bundle: t } : s), fileNameFor("save", s.name), "save")) {
            await putSave(s, true);
            await refresh();
        }
    };

    const createNewSave = async () => {
        if (!newSaveFor) {
            return;
        }
        const t = await getTemplate(newSaveFor.templateId, newSaveFor.version);
        if (!t) {
            return;
        }
        const save = createSave(t, newSaveName.trim() || t.name);
        await putSave(save);
        setNewSaveFor(null);
        onOpenSave(save.saveId);
    };

    const createNewTemplate = async () => {
        const t = createTemplate(newTemplate.name.trim(), newTemplate.game.trim());
        await putTemplate(t);
        setNewTemplateOpen(false);
        onOpenTemplate({ templateId: t.templateId, version: t.version });
    };

    const newestVersion = (templateId: string) =>
        templates.filter(t => t.templateId === templateId).sort((a, b) => compareVersions(b.version, a.version))[0]
            ?.version;

    return (
        <div className={classNames(className, "Library")}>
            <Space wrap>
                <Button
                    type="primary"
                    icon={<FontAwesomeIcon icon={faFileImport} />}
                    onClick={() => fileInput.current?.click()}
                >
                    Import file…
                </Button>
                <Button icon={<FontAwesomeIcon icon={faPlus} />} onClick={() => setNewTemplateOpen(true)}>
                    New template
                </Button>
                <span style={{ opacity: 0.7, fontSize: "0.85em" }}>
                    Templates are {templateExtension} files and saves are {saveExtension} files. Everything is also kept
                    in this browser.
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

            <Card size="small" title="Saves (your inventory)">
                <Table
                    size="small"
                    rowKey="saveId"
                    pagination={false}
                    dataSource={saves}
                    locale={{ emptyText: "No saves yet. Create one from a template below." }}
                    columns={[
                        {
                            title: "Name",
                            render: (_, s) => (
                                <Button type="link" onClick={() => onOpenSave(s.saveId)} style={{ padding: 0 }}>
                                    {s.name}
                                </Button>
                            ),
                        },
                        {
                            title: "Template",
                            render: (_, s) => {
                                const newest = newestVersion(s.template.templateId);
                                return (
                                    <>
                                        {s.template.name} v{s.template.version}{" "}
                                        {newest && compareVersions(newest, s.template.version) > 0 && (
                                            <Tag color="blue">v{newest} available</Tag>
                                        )}
                                        {!newest && <Tag color="error">template missing</Tag>}
                                    </>
                                );
                            },
                        },
                        {
                            title: "Changed",
                            render: (_, s) => (
                                <>
                                    {formatDate(s.updatedAt)}{" "}
                                    {notBackedUp(s) && (
                                        <Tooltip title={`Last exported: ${formatDate(s.lastExportedAt)}`}>
                                            <Tag color="warning">not exported</Tag>
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
                                        Open
                                    </Button>
                                    <Button size="small" onClick={() => void exportSave(s, false)}>
                                        Export
                                    </Button>
                                    <Button size="small" onClick={() => void exportSave(s, true)}>
                                        Export with template
                                    </Button>
                                    <Popconfirm
                                        title="Delete this save?"
                                        description="This cannot be undone. Export it first if you want a backup."
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={async () => {
                                            await deleteSave(s.saveId);
                                            await refresh();
                                        }}
                                    >
                                        <Button size="small" danger>
                                            Delete
                                        </Button>
                                    </Popconfirm>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>

            <Card size="small" title="Templates">
                <Table
                    size="small"
                    rowKey={t => `${t.templateId}@${t.version}`}
                    pagination={false}
                    dataSource={templates}
                    locale={{ emptyText: "No templates yet. Import a .gitemplate.json file or create a new template." }}
                    columns={[
                        { title: "Name", render: (_, t) => t.name },
                        { title: "Game", render: (_, t) => t.game },
                        { title: "Version", render: (_, t) => t.version },
                        { title: "Items", render: (_, t) => t.itemCount },
                        {
                            title: "",
                            render: (_, t) => (
                                <Space wrap>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={() => {
                                            setNewSaveName(t.name);
                                            setNewSaveFor(t);
                                        }}
                                    >
                                        New save
                                    </Button>
                                    <Button
                                        size="small"
                                        onClick={() => onOpenTemplate({ templateId: t.templateId, version: t.version })}
                                    >
                                        Edit
                                    </Button>
                                    <Button size="small" onClick={() => void exportTemplate(t)}>
                                        Export
                                    </Button>
                                    <Popconfirm
                                        title="Delete this template version?"
                                        description={
                                            saves.some(
                                                s =>
                                                    s.template.templateId === t.templateId &&
                                                    s.template.version === t.version
                                            )
                                                ? "Saves use this version and cannot be opened without it."
                                                : "This cannot be undone."
                                        }
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={async () => {
                                            await deleteTemplate(t.templateId, t.version);
                                            await refresh();
                                        }}
                                    >
                                        <Button size="small" danger>
                                            Delete
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
                title={`New save from ${newSaveFor?.name}`}
                okText="Create"
                onOk={() => void createNewSave()}
                onCancel={() => setNewSaveFor(null)}
            >
                <Input aria-label="Save name" value={newSaveName} onChange={e => setNewSaveName(e.target.value)} />
            </Modal>
            <Modal
                open={newTemplateOpen}
                title="New template"
                okText="Create"
                okButtonProps={{ disabled: !newTemplate.name.trim() }}
                onOk={() => void createNewTemplate()}
                onCancel={() => setNewTemplateOpen(false)}
            >
                <Form layout="vertical">
                    <Form.Item label="Name" required>
                        <Input
                            aria-label="New template name"
                            value={newTemplate.name}
                            onChange={e => setNewTemplate(t => ({ ...t, name: e.target.value }))}
                        />
                    </Form.Item>
                    <Form.Item label="Game">
                        <Input
                            aria-label="New template game"
                            value={newTemplate.game}
                            onChange={e => setNewTemplate(t => ({ ...t, game: e.target.value }))}
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
