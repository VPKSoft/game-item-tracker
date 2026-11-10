import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Card, Empty, Input, InputNumber, Popconfirm, Select, Space } from "antd";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { commonCounters } from "../Domain/Counters.ts";
import { uniqueId } from "../Domain/Ids.ts";
import { deleteCounter, moveOrdered, touch } from "../Domain/TemplateEdits.ts";
import type { CounterDef, Template } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    onChange: (template: Template) => void;
};

/** Describes a computed counter as a formula, e.g. "Total = Inventory + Placed". */
const describeFormula = (template: Template, counter: CounterDef) => {
    const parts = (counter.sumOf ?? []).map(k => template.counterDefs.find(c => c.key === k)?.label ?? k);
    return `${counter.label} = ${parts.length > 0 ? parts.join(" + ") : "…"}`;
};

/** Edits the amount counters of a template: manual counters and computed sums. */
const CountersEditor = ({ template, onChange }: Props) => {
    const [newLabel, setNewLabel] = React.useState("");
    const { t } = useTranslation();
    const counters = [...template.counterDefs].sort((a, b) => a.order - b.order);

    const update = (key: string, patch: Partial<CounterDef>) => {
        let counterDefs = template.counterDefs.map(c => (c.key === key ? { ...c, ...patch } : c));
        // A role belongs to one counter only; giving it to this one takes it from the others.
        if (patch.role) {
            counterDefs = counterDefs.map(c =>
                c.key !== key && c.role === patch.role ? { ...c, role: undefined } : c
            );
        }
        onChange(touch({ ...template, counterDefs }));
    };

    const add = () => {
        const label = newLabel.trim();
        if (!label) {
            return;
        }
        const key = uniqueId(
            label,
            template.counterDefs.map(c => c.key)
        );
        onChange(
            touch({
                ...template,
                counterDefs: [...template.counterDefs, { key, label, kind: "manual", order: counters.length }],
            })
        );
        setNewLabel("");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 900 }}>
            <p style={{ margin: 0 }}>
                <Trans i18nKey="counters.help" components={{ b: <b /> }} />
            </p>
            {counters.length === 0 && (
                <Empty description={t("counters.noCounters")}>
                    <Button
                        onClick={() =>
                            onChange(
                                touch({
                                    ...template,
                                    counterDefs: commonCounters({
                                        inventory: t("counters.common.inventory"),
                                        placed: t("counters.common.placed"),
                                        storage: t("counters.common.storage"),
                                        total: t("counters.common.total"),
                                        target: t("counters.common.target"),
                                        tradeable: t("counters.common.tradeable"),
                                    }),
                                })
                            )
                        }
                        type="primary"
                    >
                        {t("counters.addCommon")}
                    </Button>
                </Empty>
            )}
            {counters.map((counter, index) => (
                <Card
                    key={counter.key}
                    size="small"
                    title={
                        <Space>
                            <Input
                                aria-label={t("counters.counterLabel")}
                                value={counter.label}
                                onChange={e => update(counter.key, { label: e.target.value })}
                                style={{ width: 180 }}
                            />
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                                {t("common.key", { key: counter.key })}
                            </span>
                        </Space>
                    }
                    extra={
                        <Space>
                            <Button
                                size="small"
                                aria-label={t("common.moveUp")}
                                icon={<FontAwesomeIcon icon={faArrowUp} />}
                                disabled={index === 0}
                                onClick={() =>
                                    onChange(touch({ ...template, counterDefs: moveOrdered(counters, index, -1) }))
                                }
                            />
                            <Button
                                size="small"
                                aria-label={t("common.moveDown")}
                                icon={<FontAwesomeIcon icon={faArrowDown} />}
                                disabled={index === counters.length - 1}
                                onClick={() =>
                                    onChange(touch({ ...template, counterDefs: moveOrdered(counters, index, 1) }))
                                }
                            />
                            <Popconfirm
                                title={t("counters.deleteTitle")}
                                description={t("counters.deleteDescription")}
                                onConfirm={() => onChange(deleteCounter(template, counter.key))}
                            >
                                <Button
                                    size="small"
                                    danger
                                    aria-label={t("counters.deleteCounter")}
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                />
                            </Popconfirm>
                        </Space>
                    }
                >
                    <Space wrap align="start">
                        <Select
                            aria-label={t("counters.counterType")}
                            value={counter.kind}
                            style={{ width: 130 }}
                            onChange={kind =>
                                update(
                                    counter.key,
                                    kind === "computed"
                                        ? { kind, max: undefined, sumOf: counter.sumOf ?? [] }
                                        : { kind, sumOf: undefined }
                                )
                            }
                            options={[
                                { value: "manual", label: t("counters.manual") },
                                { value: "computed", label: t("counters.computed") },
                            ]}
                        />
                        {counter.kind === "computed" && (
                            <Select
                                mode="multiple"
                                aria-label={t("counters.sumOf")}
                                style={{ minWidth: 260 }}
                                placeholder={t("counters.countersToAdd")}
                                value={counter.sumOf ?? []}
                                onChange={sumOf => update(counter.key, { sumOf })}
                                options={template.counterDefs
                                    .filter(c => c.kind === "manual")
                                    .map(c => ({ value: c.key, label: c.label }))}
                            />
                        )}
                        <Select
                            aria-label={t("counters.role")}
                            allowClear
                            placeholder={t("counters.noRole")}
                            style={{ width: 130 }}
                            value={counter.role}
                            onChange={role => update(counter.key, { role })}
                            options={[
                                { value: "owned", label: t("counters.owned") },
                                { value: "target", label: t("counters.target") },
                            ]}
                        />
                        {template.variantDefs.length > 0 && (
                            <Select
                                mode="multiple"
                                aria-label={t("common.variants")}
                                allowClear
                                style={{ minWidth: 200 }}
                                placeholder={t("counters.allVariants")}
                                value={counter.variants ?? []}
                                onChange={variants =>
                                    update(counter.key, { variants: variants.length > 0 ? variants : undefined })
                                }
                                options={template.variantDefs.map(v => ({ value: v.key, label: v.label }))}
                            />
                        )}
                        {counter.kind === "manual" && (
                            <InputNumber
                                aria-label={t("common.maximum")}
                                min={0}
                                precision={0}
                                placeholder={t("counters.noMax")}
                                value={counter.max}
                                onChange={max =>
                                    update(counter.key, { max: typeof max === "number" ? max : undefined })
                                }
                            />
                        )}
                    </Space>
                    {counter.kind === "computed" && (
                        <div style={{ marginTop: 8, opacity: 0.8 }}>{describeFormula(template, counter)}</div>
                    )}
                </Card>
            ))}
            <Space.Compact style={{ maxWidth: 400 }}>
                <Input
                    aria-label={t("counters.newCounterLabel")}
                    placeholder={t("counters.newCounterPlaceholder")}
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onPressEnter={add}
                />
                <Button onClick={add} disabled={!newLabel.trim()}>
                    {t("counters.addCounter")}
                </Button>
            </Space.Compact>
        </div>
    );
};

export { CountersEditor, describeFormula };
