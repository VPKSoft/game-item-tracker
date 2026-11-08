import { Button, Checkbox, Drawer, Form, Input, InputNumber, Popconfirm, Select, Space, Switch } from "antd";
import * as React from "react";
import { ImageDropZone } from "../Components/ImageDropZone.tsx";
import { TagEditor } from "../Components/TagEditor.tsx";
import { getItemVariants } from "../Domain/Counters.ts";
import { uniqueId } from "../Domain/Ids.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    /** The item to edit, a new draft (empty id), or null when closed. */
    item: TemplateItem | null;
    onClose: () => void;
    /** Saves the item; a new image, if any, is passed along. */
    onSave: (item: TemplateItem, image?: { id: string; dataUrl: string }) => void;
    onDelete: (itemId: string) => void;
};

/** Creates a new item draft in the given category. */
const newItemDraft = (template: Template, categoryId?: string): TemplateItem => ({
    id: "",
    categoryId: categoryId ?? template.categories[0]?.id ?? "",
    name: "",
    description: "",
    attributes: {},
    tags: [],
});

/** The template editor's drawer for creating and editing one item. */
const TemplateItemDrawer = ({ template, item, onClose, onSave, onDelete }: Props) => {
    const [draft, setDraft] = React.useState<TemplateItem | null>(item);
    const [image, setImage] = React.useState<{ id: string; dataUrl: string } | undefined>();
    React.useEffect(() => {
        setDraft(item);
        setImage(undefined);
    }, [item]);

    if (!draft) {
        return <Drawer open={false} onClose={onClose} />;
    }
    const isNew = draft.id === "";
    const set = (patch: Partial<TemplateItem>) => setDraft(d => (d ? { ...d, ...patch } : d));
    const imageUrl = image?.dataUrl ?? (draft.imageId ? template.images[draft.imageId] : undefined);
    const manualCounters = template.counterDefs.filter(c => c.kind === "manual");
    const itemVariants = getItemVariants(template, draft);
    const canSave = draft.name.trim().length > 0 && template.categories.some(c => c.id === draft.categoryId);

    const save = () => {
        const id = isNew
            ? uniqueId(
                  draft.name,
                  template.items.map(i => i.id)
              )
            : draft.id;
        onSave({ ...draft, id, name: draft.name.trim(), imageId: image?.id ?? draft.imageId }, image);
    };

    return (
        <Drawer
            open
            onClose={onClose}
            title={isNew ? "New item" : `Edit ${item?.name}`}
            size={480}
            extra={
                <Space>
                    {!isNew && (
                        <Popconfirm title="Delete this item?" onConfirm={() => onDelete(draft.id)}>
                            <Button danger>Delete</Button>
                        </Popconfirm>
                    )}
                    <Button type="primary" onClick={save} disabled={!canSave}>
                        Save
                    </Button>
                </Space>
            }
        >
            <Form layout="vertical">
                {!isNew && <Form.Item label="Id">{draft.id}</Form.Item>}
                <Form.Item label="Name" required>
                    <Input
                        aria-label="Name"
                        value={draft.name}
                        onChange={e => set({ name: e.target.value })}
                        autoFocus
                    />
                </Form.Item>
                <Form.Item label="Category" required>
                    <Select
                        aria-label="Category"
                        value={draft.categoryId || undefined}
                        onChange={categoryId => set({ categoryId })}
                        options={template.categories.map(c => ({ value: c.id, label: c.name }))}
                        placeholder={template.categories.length === 0 ? "Add a category first" : "Choose a category"}
                    />
                </Form.Item>
                <Form.Item label="Description">
                    <Input.TextArea
                        aria-label="Description"
                        autoSize={{ minRows: 2, maxRows: 8 }}
                        value={draft.description}
                        onChange={e => set({ description: e.target.value })}
                    />
                </Form.Item>
                <Form.Item label="Image">
                    <ImageDropZone
                        image={imageUrl}
                        onAccept={(id, dataUrl) => setImage({ id, dataUrl })}
                        onRemove={() => {
                            setImage(undefined);
                            set({ imageId: undefined });
                        }}
                    />
                </Form.Item>
                {template.attributeDefs.map(def => (
                    <Form.Item key={def.key} label={def.label}>
                        {def.levels && def.levels.length > 0 ? (
                            <Select
                                allowClear
                                aria-label={def.label}
                                value={draft.attributes[def.key]}
                                onChange={value => {
                                    const { [def.key]: _old, ...rest } = draft.attributes;
                                    set({ attributes: value === undefined ? rest : { ...rest, [def.key]: value } });
                                }}
                                options={def.levels.map(l => ({ value: l.value, label: `${l.value} – ${l.label}` }))}
                            />
                        ) : (
                            <InputNumber
                                aria-label={def.label}
                                min={def.min}
                                max={def.max}
                                step={def.step}
                                value={draft.attributes[def.key]}
                                onChange={value => {
                                    const { [def.key]: _old, ...rest } = draft.attributes;
                                    set({
                                        attributes: typeof value === "number" ? { ...rest, [def.key]: value } : rest,
                                    });
                                }}
                            />
                        )}
                    </Form.Item>
                ))}
                <Form.Item label="Tags">
                    <TagEditor value={draft.tags} suggestions={template.tags} onChange={tags => set({ tags })} />
                </Form.Item>
                {template.variantDefs.length > 0 && (
                    <Form.Item label="Variants">
                        <Checkbox.Group
                            value={draft.variants ?? template.variantDefs.map(v => v.key)}
                            onChange={values => {
                                const all = values.length === template.variantDefs.length;
                                const variants = values as string[];
                                const unique = Array.isArray(draft.unique)
                                    ? draft.unique.filter(k => variants.includes(k))
                                    : draft.unique;
                                set({
                                    variants: all ? undefined : variants,
                                    unique: Array.isArray(unique) && unique.length === 0 ? undefined : unique,
                                });
                            }}
                            options={template.variantDefs.map(v => ({ value: v.key, label: v.label }))}
                        />
                    </Form.Item>
                )}
                <Form.Item
                    label="Unique"
                    extra="A unique item is either obtained or not: saves show an obtained checkbox instead of counters."
                >
                    <Space orientation="vertical">
                        <Switch
                            aria-label="Unique"
                            checked={draft.unique !== undefined}
                            onChange={unique => set({ unique: unique ? true : undefined })}
                        />
                        {draft.unique !== undefined && itemVariants.length > 1 && (
                            <Checkbox.Group
                                aria-label="Unique variants"
                                value={draft.unique === true ? itemVariants.map(v => v.key) : draft.unique}
                                onChange={values => {
                                    const keys = values as string[];
                                    const all = itemVariants.every(v => keys.includes(v.key));
                                    set({ unique: all ? true : keys.length > 0 ? keys : undefined });
                                }}
                                options={itemVariants.map(v => ({ value: v.key, label: v.label }))}
                            />
                        )}
                    </Space>
                </Form.Item>
                {manualCounters.length > 0 && draft.unique !== true && (
                    <Form.Item label="Initial amounts in new saves">
                        <Space wrap>
                            {manualCounters.map(counter => (
                                <Space.Compact key={counter.key}>
                                    <Space.Addon>{counter.label}</Space.Addon>
                                    <InputNumber
                                        aria-label={`Default ${counter.label}`}
                                        min={0}
                                        precision={0}
                                        style={{ width: 70 }}
                                        value={draft.defaults?.[counter.key]}
                                        onChange={value => {
                                            const { [counter.key]: _old, ...rest } = draft.defaults ?? {};
                                            const defaults =
                                                typeof value === "number" && value > 0
                                                    ? { ...rest, [counter.key]: value }
                                                    : rest;
                                            set({ defaults: Object.keys(defaults).length > 0 ? defaults : undefined });
                                        }}
                                    />
                                </Space.Compact>
                            ))}
                        </Space>
                    </Form.Item>
                )}
                <Form.Item label="Deprecated (removed from the game, kept for old saves)">
                    <Switch
                        checked={!!draft.deprecated}
                        onChange={deprecated => set({ deprecated: deprecated || undefined })}
                    />
                </Form.Item>
            </Form>
        </Drawer>
    );
};

export { newItemDraft, TemplateItemDrawer };
