import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Card, Input, InputNumber, Modal, Popconfirm, Select, Space, Table } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { uniqueId } from "../Domain/Ids.ts";
import {
    countTags,
    deleteAttribute,
    deleteCategory,
    deleteTag,
    deleteVariant,
    moveOrdered,
    renameTag,
    touch,
} from "../Domain/TemplateEdits.ts";
import type { AttributeDef, Category, Template, VariantDef } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    onChange: (template: Template) => void;
};

const MoveButtons = ({ index, count, onMove }: { index: number; count: number; onMove: (delta: -1 | 1) => void }) => {
    const { t } = useTranslation();
    return (
        <>
            <Button
                size="small"
                aria-label={t("common.moveUp")}
                icon={<FontAwesomeIcon icon={faArrowUp} />}
                disabled={index === 0}
                onClick={() => onMove(-1)}
            />
            <Button
                size="small"
                aria-label={t("common.moveDown")}
                icon={<FontAwesomeIcon icon={faArrowDown} />}
                disabled={index === count - 1}
                onClick={() => onMove(1)}
            />
        </>
    );
};

const AddRow = ({
    placeholder,
    onAdd,
    label,
}: {
    placeholder: string;
    onAdd: (name: string) => void;
    label: string;
}) => {
    const [value, setValue] = React.useState("");
    const add = () => {
        if (value.trim()) {
            onAdd(value.trim());
            setValue("");
        }
    };
    return (
        <Space.Compact style={{ maxWidth: 420 }}>
            <Input
                aria-label={placeholder}
                placeholder={placeholder}
                value={value}
                onChange={e => setValue(e.target.value)}
                onPressEnter={add}
            />
            <Button onClick={add} disabled={!value.trim()}>
                {label}
            </Button>
        </Space.Compact>
    );
};

/** Edits the categories: names, parents, order and deletion (moving the items elsewhere). */
const CategoriesEditor = ({ template, onChange }: Props) => {
    const categories = [...template.categories].sort((a, b) => a.order - b.order);
    const [deleting, setDeleting] = React.useState<Category | null>(null);
    const [moveTo, setMoveTo] = React.useState<string | undefined>();
    const { t } = useTranslation();
    const counts = new Map<string, number>();
    for (const item of template.items) {
        counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
    const update = (id: string, patch: Partial<Category>) =>
        onChange(
            touch({ ...template, categories: template.categories.map(c => (c.id === id ? { ...c, ...patch } : c)) })
        );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 800 }}>
            <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={categories}
                columns={[
                    {
                        title: t("common.name"),
                        render: (_, c) => (
                            <Input
                                aria-label={t("categories.categoryName")}
                                value={c.name}
                                onChange={e => update(c.id, { name: e.target.value })}
                            />
                        ),
                    },
                    {
                        title: t("categories.parent"),
                        width: 220,
                        render: (_, c) => (
                            <Select
                                allowClear
                                aria-label={t("categories.parentCategory")}
                                style={{ width: "100%" }}
                                placeholder={t("common.none")}
                                value={c.parentId}
                                onChange={parentId => update(c.id, { parentId })}
                                options={categories
                                    .filter(o => o.id !== c.id)
                                    .map(o => ({ value: o.id, label: o.name }))}
                            />
                        ),
                    },
                    { title: t("common.items"), width: 70, render: (_, c) => counts.get(c.id) ?? 0 },
                    {
                        title: "",
                        width: 130,
                        render: (_, c, index) => (
                            <Space>
                                <MoveButtons
                                    index={index}
                                    count={categories.length}
                                    onMove={delta =>
                                        onChange(
                                            touch({ ...template, categories: moveOrdered(categories, index, delta) })
                                        )
                                    }
                                />
                                <Button
                                    size="small"
                                    danger
                                    aria-label={t("categories.deleteCategory")}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                    onClick={() => {
                                        if ((counts.get(c.id) ?? 0) === 0) {
                                            onChange(deleteCategory(template, c.id, c.id));
                                        } else {
                                            setMoveTo(undefined);
                                            setDeleting(c);
                                        }
                                    }}
                                />
                            </Space>
                        ),
                    },
                ]}
            />
            <AddRow
                placeholder={t("categories.newCategory")}
                label={t("categories.addCategory")}
                onAdd={name =>
                    onChange(
                        touch({
                            ...template,
                            categories: [
                                ...template.categories,
                                {
                                    id: uniqueId(
                                        name,
                                        template.categories.map(c => c.id)
                                    ),
                                    name,
                                    order: categories.length,
                                },
                            ],
                        })
                    )
                }
            />
            <Modal
                open={deleting !== null}
                title={t("categories.deleteTitle", { name: deleting?.name })}
                okText={t("common.delete")}
                okButtonProps={{ danger: true, disabled: !moveTo }}
                onCancel={() => setDeleting(null)}
                onOk={() => {
                    if (deleting && moveTo) {
                        onChange(deleteCategory(template, deleting.id, moveTo));
                    }
                    setDeleting(null);
                }}
            >
                <p>{t("categories.moveItemsTo", { count: counts.get(deleting?.id ?? "") ?? 0 })}</p>
                <Select
                    style={{ width: "100%" }}
                    aria-label={t("categories.moveItemsToLabel")}
                    value={moveTo}
                    onChange={setMoveTo}
                    options={categories.filter(c => c.id !== deleting?.id).map(c => ({ value: c.id, label: c.name }))}
                />
            </Modal>
        </div>
    );
};

/** Edits the item variants, such as "Normal" and "★ Starred". */
const VariantsEditor = ({ template, onChange }: Props) => {
    const variants = [...template.variantDefs].sort((a, b) => a.order - b.order);
    const { t } = useTranslation();
    const update = (key: string, patch: Partial<VariantDef>) =>
        onChange(
            touch({ ...template, variantDefs: template.variantDefs.map(v => (v.key === key ? { ...v, ...patch } : v)) })
        );
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
            <p style={{ margin: 0 }}>{t("variants.help")}</p>
            {variants.map((variant, index) => (
                <Space key={variant.key}>
                    <Input
                        aria-label={t("variants.variantLabel")}
                        value={variant.label}
                        onChange={e => update(variant.key, { label: e.target.value })}
                        style={{ width: 220 }}
                    />
                    <span style={{ opacity: 0.6 }}>{t("common.key", { key: variant.key })}</span>
                    <MoveButtons
                        index={index}
                        count={variants.length}
                        onMove={delta =>
                            onChange(touch({ ...template, variantDefs: moveOrdered(variants, index, delta) }))
                        }
                    />
                    <Popconfirm
                        title={t("variants.deleteTitle")}
                        onConfirm={() => onChange(deleteVariant(template, variant.key))}
                    >
                        <Button
                            size="small"
                            danger
                            aria-label={t("variants.deleteVariant")}
                            icon={<FontAwesomeIcon icon={faTrash} />}
                        />
                    </Popconfirm>
                </Space>
            ))}
            <AddRow
                placeholder={t("variants.newVariant")}
                label={t("variants.addVariant")}
                onAdd={label =>
                    onChange(
                        touch({
                            ...template,
                            variantDefs: [
                                ...template.variantDefs,
                                {
                                    key: uniqueId(
                                        label,
                                        template.variantDefs.map(v => v.key)
                                    ),
                                    label,
                                    order: variants.length,
                                },
                            ],
                        })
                    )
                }
            />
        </div>
    );
};

/** Edits the numeric attribute definitions (read-only values in saves), with optional named levels. */
const AttributesEditor = ({ template, onChange }: Props) => {
    const { t } = useTranslation();
    const update = (key: string, patch: Partial<AttributeDef>) =>
        onChange(
            touch({
                ...template,
                attributeDefs: template.attributeDefs.map(a => (a.key === key ? { ...a, ...patch } : a)),
            })
        );
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 800 }}>
            <p style={{ margin: 0 }}>{t("attributes.help")}</p>
            {template.attributeDefs.map(attribute => (
                <Card
                    key={attribute.key}
                    size="small"
                    title={
                        <Space>
                            <Input
                                aria-label={t("attributes.attributeLabel")}
                                value={attribute.label}
                                onChange={e => update(attribute.key, { label: e.target.value })}
                            />
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                                {t("common.key", { key: attribute.key })}
                            </span>
                        </Space>
                    }
                    extra={
                        <Popconfirm
                            title={t("attributes.deleteTitle")}
                            onConfirm={() => onChange(deleteAttribute(template, attribute.key))}
                        >
                            <Button
                                size="small"
                                danger
                                aria-label={t("attributes.deleteAttribute")}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                            />
                        </Popconfirm>
                    }
                >
                    <Space wrap>
                        <InputNumber
                            aria-label={t("common.minimum")}
                            prefix={t("attributes.min")}
                            value={attribute.min}
                            onChange={min => update(attribute.key, { min: min ?? 0 })}
                        />
                        <InputNumber
                            aria-label={t("common.maximum")}
                            prefix={t("attributes.max")}
                            value={attribute.max}
                            onChange={max => update(attribute.key, { max: max ?? 0 })}
                        />
                    </Space>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {(attribute.levels ?? []).map((level, index) => (
                            <Space key={`${attribute.key}-${index}`}>
                                <InputNumber
                                    aria-label={t("attributes.levelValue")}
                                    value={level.value}
                                    style={{ width: 70 }}
                                    onChange={value =>
                                        update(attribute.key, {
                                            levels: attribute.levels?.map((l, i) =>
                                                i === index ? { ...l, value: value ?? 0 } : l
                                            ),
                                        })
                                    }
                                />
                                <Input
                                    aria-label={t("attributes.levelLabel")}
                                    value={level.label}
                                    onChange={e =>
                                        update(attribute.key, {
                                            levels: attribute.levels?.map((l, i) =>
                                                i === index ? { ...l, label: e.target.value } : l
                                            ),
                                        })
                                    }
                                />
                                <Button
                                    size="small"
                                    aria-label={t("attributes.deleteLevel")}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                    onClick={() =>
                                        update(attribute.key, {
                                            levels: attribute.levels?.filter((_, i) => i !== index),
                                        })
                                    }
                                />
                            </Space>
                        ))}
                        <Button
                            size="small"
                            style={{ alignSelf: "flex-start" }}
                            onClick={() => {
                                const levels = attribute.levels ?? [];
                                const next =
                                    levels.length > 0 ? Math.max(...levels.map(l => l.value)) + 1 : attribute.min;
                                update(attribute.key, {
                                    levels: [
                                        ...levels,
                                        { value: next, label: t("attributes.defaultLevelLabel", { value: next }) },
                                    ],
                                });
                            }}
                        >
                            {t("attributes.addNamedLevel")}
                        </Button>
                    </div>
                </Card>
            ))}
            <AddRow
                placeholder={t("attributes.newAttribute")}
                label={t("attributes.addAttribute")}
                onAdd={label =>
                    onChange(
                        touch({
                            ...template,
                            attributeDefs: [
                                ...template.attributeDefs,
                                {
                                    key: uniqueId(
                                        label,
                                        template.attributeDefs.map(a => a.key)
                                    ),
                                    label,
                                    min: 1,
                                    max: 5,
                                },
                            ],
                        })
                    )
                }
            />
        </div>
    );
};

/** Edits the predefined tag vocabulary: add, rename (or merge) and delete tags. */
const TagsVocabularyEditor = ({ template, onChange }: Props) => {
    const counts = countTags(template);
    const [renaming, setRenaming] = React.useState<{ from: string; to: string } | null>(null);
    const [filter, setFilter] = React.useState("");
    const { t } = useTranslation();
    const rows = [...counts.entries()]
        .filter(([tag]) => tag.toLowerCase().includes(filter.toLowerCase()))
        .sort((a, b) => a[0].localeCompare(b[0]));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
            <Space wrap>
                <Input
                    allowClear
                    aria-label={t("tagVocabulary.filterTags")}
                    placeholder={t("tagVocabulary.filterTags")}
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <AddRow
                    placeholder={t("tagVocabulary.newTag")}
                    label={t("tagVocabulary.addTag")}
                    onAdd={tag =>
                        !template.tags.includes(tag) && onChange(touch({ ...template, tags: [...template.tags, tag] }))
                    }
                />
            </Space>
            <Table
                size="small"
                rowKey={([tag]) => tag}
                dataSource={rows}
                pagination={{ pageSize: 50, hideOnSinglePage: true }}
                columns={[
                    { title: t("tagVocabulary.tag"), render: (_, [tag]) => tag },
                    { title: t("common.items"), width: 80, render: (_, [, count]) => count },
                    {
                        title: "",
                        width: 170,
                        render: (_, [tag]) => (
                            <Space>
                                <Button size="small" onClick={() => setRenaming({ from: tag, to: tag })}>
                                    {t("common.rename")}
                                </Button>
                                <Popconfirm
                                    title={t("tagVocabulary.deleteTitle")}
                                    onConfirm={() => onChange(deleteTag(template, tag))}
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
            <Modal
                open={renaming !== null}
                title={t("tagVocabulary.renameTitle", { tag: renaming?.from })}
                onCancel={() => setRenaming(null)}
                onOk={() => {
                    if (renaming) {
                        onChange(renameTag(template, renaming.from, renaming.to));
                    }
                    setRenaming(null);
                }}
            >
                <p>{t("tagVocabulary.renameHelp")}</p>
                <Input
                    aria-label={t("tagVocabulary.newTagName")}
                    value={renaming?.to}
                    onChange={e => setRenaming(r => (r ? { ...r, to: e.target.value } : r))}
                />
            </Modal>
        </div>
    );
};

export { AttributesEditor, CategoriesEditor, TagsVocabularyEditor, VariantsEditor };
