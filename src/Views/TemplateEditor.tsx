import { faDownload, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, App, Badge, Button, Dropdown, Empty, Form, Input, Spin, Tabs } from "antd";
import classNames from "classnames";
import * as React from "react";
import { styled } from "styled-components";
import { ItemBrowser } from "../Components/ItemBrowser.tsx";
import { ItemCard } from "../Components/ItemCard.tsx";
import { addImage, deleteItem, newVersion, touch, upsertItem } from "../Domain/TemplateEdits.ts";
import { validateTemplate } from "../Domain/Validation.ts";
import { downloadFile, fileNameFor, serialize } from "../Files/FileIo.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { getTemplate, putTemplate } from "../Storage/Database.ts";
import { useAutosave } from "../Storage/UseAutosave.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { CountersEditor } from "./CountersEditor.tsx";
import { AttributesEditor, CategoriesEditor, TagsVocabularyEditor, VariantsEditor } from "./StructureEditors.tsx";
import { newItemDraft, TemplateItemDrawer } from "./TemplateItemDrawer.tsx";

/** Identifies a stored template version. */
type TemplateKey = { templateId: string; version: string };

type Props = {
    templateKey: TemplateKey | null;
    onOpenTemplate: (key: TemplateKey) => void;
    onOpenLibrary: () => void;
} & BaseProps;

/** The editor of game templates: items and the structure that saves are built from. */
let TemplateEditor = ({ className, templateKey, onOpenTemplate, onOpenLibrary }: Props) => {
    const [template, setTemplate] = React.useState<Template | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<TemplateItem | null>(null);
    const [tab, setTab] = React.useState("items");
    const { modal } = App.useApp();

    const templateId = templateKey?.templateId;
    const version = templateKey?.version;
    React.useEffect(() => {
        let cancelled = false;
        setTemplate(null);
        setError(null);
        if (!templateId || !version) {
            return;
        }
        setLoading(true);
        getTemplate(templateId, version)
            .then(t => {
                if (!cancelled) {
                    if (t) {
                        setTemplate(t);
                    } else {
                        setError("The template was not found. It may have been deleted.");
                    }
                }
            })
            .catch(e => !cancelled && setError(String(e)))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [templateId, version]);

    // Templates can be large (images), so they are written less often than saves.
    const flush = useAutosave(template, putTemplate, 1500);

    const issues = React.useMemo(() => (template ? validateTemplate(template) : []), [template]);

    const openItem = React.useCallback(
        (itemId: string) => setEditing(template?.items.find(i => i.id === itemId) ?? null),
        [template]
    );

    const renderCard = React.useCallback(
        (item: TemplateItem) => (template ? <ItemCard template={template} item={item} onOpen={openItem} /> : null),
        [template, openItem]
    );

    if (!templateKey) {
        return (
            <Empty className={className} description="No template is open">
                <Button type="primary" onClick={onOpenLibrary}>
                    Open the library
                </Button>
            </Empty>
        );
    }
    if (loading) {
        return <Spin className={className} />;
    }
    if (error || !template) {
        return (
            <div className={className}>
                <Alert type="error" showIcon title={error ?? "The template could not be opened."} />
            </div>
        );
    }

    const change = (next: Template) => setTemplate(next);

    const exportTemplate = async () => {
        if (issues.length > 0) {
            const proceed = await new Promise<boolean>(resolve =>
                modal.confirm({
                    title: "The template has problems",
                    content: `${issues.length} problem(s) were found. See the Details tab. Export anyway?`,
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                })
            );
            if (!proceed) {
                return;
            }
        }
        flush();
        if (await downloadFile(serialize(template), fileNameFor("template", template.name), "template")) {
            await putTemplate(template, true);
        }
    };

    const saveAsNewVersion = async (part: "major" | "minor" | "patch") => {
        flush();
        const next = newVersion(template, part);
        await putTemplate(next);
        onOpenTemplate({ templateId: next.templateId, version: next.version });
    };

    const items = (
        <ItemBrowser
            template={template}
            renderCard={renderCard}
            stateKey={`browser:template:${template.templateId}`}
            toolbarExtra={
                <Button
                    type="primary"
                    icon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => setEditing(newItemDraft(template))}
                    disabled={template.categories.length === 0}
                    title={template.categories.length === 0 ? "Add a category first" : undefined}
                >
                    Add item
                </Button>
            }
        />
    );

    const details = (
        <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 12 }}>
            <Form layout="vertical">
                <Form.Item label="Name">
                    <Input
                        aria-label="Template name"
                        value={template.name}
                        onChange={e => change(touch({ ...template, name: e.target.value }))}
                    />
                </Form.Item>
                <Form.Item label="Game">
                    <Input
                        aria-label="Game"
                        value={template.game}
                        onChange={e => change(touch({ ...template, game: e.target.value }))}
                    />
                </Form.Item>
                <Form.Item label="Description">
                    <Input.TextArea
                        aria-label="Template description"
                        autoSize={{ minRows: 2 }}
                        value={template.description}
                        onChange={e => change(touch({ ...template, description: e.target.value }))}
                    />
                </Form.Item>
                <Form.Item label="Source / attribution">
                    <Input
                        aria-label="Source"
                        placeholder="Source name"
                        value={template.source?.name}
                        onChange={e =>
                            change(
                                touch({ ...template, source: { url: "", ...template.source, name: e.target.value } })
                            )
                        }
                    />
                    <Input
                        aria-label="Source URL"
                        placeholder="URL"
                        style={{ marginTop: 6 }}
                        value={template.source?.url}
                        onChange={e =>
                            change(
                                touch({ ...template, source: { name: "", ...template.source, url: e.target.value } })
                            )
                        }
                    />
                    <Input
                        aria-label="License"
                        placeholder="License"
                        style={{ marginTop: 6 }}
                        value={template.source?.license}
                        onChange={e =>
                            change(
                                touch({
                                    ...template,
                                    source: { name: "", url: "", ...template.source, license: e.target.value },
                                })
                            )
                        }
                    />
                </Form.Item>
                <Form.Item
                    label={`Version ${template.version}`}
                    extra="Saves upgrade to a new version when the game changes. The current version stays for saves that use it."
                >
                    <Dropdown
                        menu={{
                            items: [
                                { key: "patch", label: "Patch version (fixes)" },
                                { key: "minor", label: "Minor version (new items)" },
                                { key: "major", label: "Major version (big changes)" },
                            ],
                            onClick: ({ key }) => void saveAsNewVersion(key as "major" | "minor" | "patch"),
                        }}
                    >
                        <Button>Save as new version…</Button>
                    </Dropdown>
                </Form.Item>
            </Form>
            {issues.length > 0 ? (
                <Alert
                    type="warning"
                    showIcon
                    title={`${issues.length} problem(s)`}
                    description={
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {issues.slice(0, 50).map(issue => (
                                <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
                            ))}
                        </ul>
                    }
                />
            ) : (
                <Alert type="success" showIcon title="No problems found" />
            )}
        </div>
    );

    return (
        <div className={classNames(className, "TemplateEditor")}>
            <div className="TemplateEditor-header">
                <div className="TemplateEditor-title">
                    {template.name}
                    <span className="TemplateEditor-subtitle">
                        {template.game} · v{template.version} · {template.items.length} items
                    </span>
                </div>
                <Button icon={<FontAwesomeIcon icon={faDownload} />} onClick={() => void exportTemplate()}>
                    Export
                </Button>
            </div>
            <Tabs
                className="TemplateEditor-tabs"
                activeKey={tab}
                onChange={setTab}
                items={[
                    { key: "items", label: "Items", children: items },
                    {
                        key: "categories",
                        label: "Categories",
                        children: <CategoriesEditor template={template} onChange={change} />,
                    },
                    {
                        key: "counters",
                        label: "Counters",
                        children: <CountersEditor template={template} onChange={change} />,
                    },
                    {
                        key: "variants",
                        label: "Variants",
                        children: <VariantsEditor template={template} onChange={change} />,
                    },
                    {
                        key: "attributes",
                        label: "Attributes",
                        children: <AttributesEditor template={template} onChange={change} />,
                    },
                    {
                        key: "tags",
                        label: "Tags",
                        children: <TagsVocabularyEditor template={template} onChange={change} />,
                    },
                    {
                        key: "details",
                        label: (
                            <Badge count={issues.length} size="small" offset={[8, 0]}>
                                Details
                            </Badge>
                        ),
                        children: details,
                    },
                ]}
            />
            <TemplateItemDrawer
                template={template}
                item={editing}
                onClose={() => setEditing(null)}
                onSave={(item, image) => {
                    const withImage = image ? addImage(template, image.id, image.dataUrl) : template;
                    change(upsertItem(withImage, item));
                    setEditing(null);
                }}
                onDelete={id => {
                    change(deleteItem(template, id));
                    setEditing(null);
                }}
            />
        </div>
    );
};

TemplateEditor = styled(TemplateEditor)`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    .TemplateEditor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }
    .TemplateEditor-title {
        font-size: 1.2em;
        font-weight: 600;
    }
    .TemplateEditor-subtitle {
        font-size: 0.75em;
        font-weight: 400;
        opacity: 0.7;
        margin-left: 10px;
    }
    .TemplateEditor-tabs {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
    .TemplateEditor-tabs > .ant-tabs-content-holder {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }
    .TemplateEditor-tabs > .ant-tabs-content-holder > .ant-tabs-content,
    .TemplateEditor-tabs > .ant-tabs-content-holder > .ant-tabs-content > .ant-tabs-tabpane-active {
        height: 100%;
        display: flex;
        flex-direction: column;
    }
`;

export type { TemplateKey };
export { TemplateEditor };
