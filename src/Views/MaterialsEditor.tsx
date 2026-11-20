import { faImage } from "@fortawesome/free-regular-svg-icons";
import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Button, Form, Input, Modal, Popconfirm, Space } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ImageDropZone } from "../Components/ImageDropZone.tsx";
import { findRoleCounter } from "../Domain/Counters.ts";
import { uniqueId } from "../Domain/Ids.ts";
import { getMaterials } from "../Domain/Materials.ts";
import { addImage, deleteMaterial, moveOrdered, touch, upsertMaterial } from "../Domain/TemplateEdits.ts";
import type { Material, Template } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    onChange: (template: Template) => void;
};

/** A dimmed, fixed-width text, so that the buttons after it line up from row to row. */
const dimText: React.CSSProperties = {
    opacity: 0.6,
    display: "inline-block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
};

/** Edits the materials of a template: names, images, order, and deletion (removing them from items). */
const MaterialsEditor = ({ template, onChange }: Props) => {
    const { t } = useTranslation();
    const [newName, setNewName] = React.useState("");
    const [imageFor, setImageFor] = React.useState<string | null>(null);
    const materials = getMaterials(template);
    const imageMaterial = materials.find(m => m.id === imageFor);

    const update = (material: Material) => onChange(upsertMaterial(template, material));

    const add = () => {
        const name = newName.trim();
        if (!name) {
            return;
        }
        onChange(
            upsertMaterial(template, {
                id: uniqueId(
                    name,
                    materials.map(m => m.id)
                ),
                name,
                order: materials.length,
            })
        );
        setNewName("");
    };

    const countUses = (id: string) => template.items.filter(i => (i.materials?.[id] ?? 0) > 0).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 760 }}>
            <p style={{ margin: 0 }}>{t("materialsEditor.help")}</p>
            <Form layout="vertical" style={{ maxWidth: 420 }}>
                <Form.Item
                    label={t("materialsEditor.buttonText")}
                    extra={t("materialsEditor.buttonTextHint", { text: t("materials.toggle") })}
                    style={{ marginBottom: 0 }}
                >
                    <Input
                        aria-label={t("materialsEditor.buttonText")}
                        placeholder={t("materials.toggle")}
                        allowClear
                        value={template.materialsLabel ?? ""}
                        onChange={e => {
                            const { materialsLabel: _old, ...rest } = template;
                            onChange(touch(e.target.value ? { ...rest, materialsLabel: e.target.value } : rest));
                        }}
                    />
                </Form.Item>
            </Form>
            {materials.length > 0 && !findRoleCounter(template, "planned") && (
                <Alert type="info" showIcon title={t("materialsEditor.noPlannedCounter")} />
            )}
            {materials.map((material, index) => {
                const image = material.imageId ? template.images[material.imageId] : undefined;
                return (
                    <Space key={material.id} wrap>
                        <Button
                            aria-label={t("materialsEditor.imageTitle", { name: material.name })}
                            onClick={() => setImageFor(material.id)}
                            style={{ width: 40, height: 40, padding: 2 }}
                        >
                            {image ? (
                                <img src={image} alt="" style={{ maxWidth: 32, maxHeight: 32 }} />
                            ) : (
                                <FontAwesomeIcon icon={faImage} />
                            )}
                        </Button>
                        <Input
                            aria-label={t("materialsEditor.materialName")}
                            value={material.name}
                            onChange={e => update({ ...material, name: e.target.value })}
                            style={{ width: 220 }}
                        />
                        <span style={{ ...dimText, width: 200 }} title={material.id}>
                            {t("common.key", { key: material.id })}
                        </span>
                        <span style={{ ...dimText, width: 130 }}>
                            {t("materialsEditor.usedBy", { count: countUses(material.id) })}
                        </span>
                        <Button
                            size="small"
                            aria-label={t("common.moveUp")}
                            icon={<FontAwesomeIcon icon={faArrowUp} />}
                            disabled={index === 0}
                            onClick={() =>
                                onChange(touch({ ...template, materials: moveOrdered(materials, index, -1) }))
                            }
                        />
                        <Button
                            size="small"
                            aria-label={t("common.moveDown")}
                            icon={<FontAwesomeIcon icon={faArrowDown} />}
                            disabled={index === materials.length - 1}
                            onClick={() =>
                                onChange(touch({ ...template, materials: moveOrdered(materials, index, 1) }))
                            }
                        />
                        <Popconfirm
                            title={t("materialsEditor.deleteTitle")}
                            onConfirm={() => onChange(deleteMaterial(template, material.id))}
                        >
                            <Button
                                size="small"
                                danger
                                aria-label={t("materialsEditor.deleteMaterial")}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                            />
                        </Popconfirm>
                    </Space>
                );
            })}
            <Space.Compact style={{ maxWidth: 420 }}>
                <Input
                    aria-label={t("materialsEditor.newMaterial")}
                    placeholder={t("materialsEditor.newMaterial")}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onPressEnter={add}
                />
                <Button onClick={add} disabled={!newName.trim()}>
                    {t("materialsEditor.addMaterial")}
                </Button>
            </Space.Compact>
            <Modal
                open={!!imageMaterial}
                title={imageMaterial ? t("materialsEditor.imageTitle", { name: imageMaterial.name }) : ""}
                onCancel={() => setImageFor(null)}
                footer={<Button onClick={() => setImageFor(null)}>{t("common.close")}</Button>}
                destroyOnHidden
            >
                {imageMaterial && (
                    <ImageDropZone
                        image={imageMaterial.imageId ? template.images[imageMaterial.imageId] : undefined}
                        onAccept={(id, dataUrl) =>
                            onChange(upsertMaterial(addImage(template, id, dataUrl), { ...imageMaterial, imageId: id }))
                        }
                        onRemove={() => {
                            const { imageId: _old, ...rest } = imageMaterial;
                            onChange(upsertMaterial(template, rest));
                        }}
                    />
                )}
            </Modal>
        </div>
    );
};

export { MaterialsEditor };
