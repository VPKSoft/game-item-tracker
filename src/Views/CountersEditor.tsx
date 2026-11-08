import { faArrowDown, faArrowUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Card, Empty, Input, InputNumber, Popconfirm, Select, Space } from "antd";
import * as React from "react";
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
                Counters are the amounts users track per item. Manual counters are edited by the user. A computed
                counter is the sum of chosen manual counters. Mark one counter as <b>owned</b> and one as <b>target</b>{" "}
                to get progress bars and the &quot;missing&quot; sort and filter.
            </p>
            {counters.length === 0 && (
                <Empty description="This template has no counters">
                    <Button
                        onClick={() => onChange(touch({ ...template, counterDefs: commonCounters() }))}
                        type="primary"
                    >
                        Add common counters
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
                                aria-label="Counter label"
                                value={counter.label}
                                onChange={e => update(counter.key, { label: e.target.value })}
                                style={{ width: 180 }}
                            />
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>key: {counter.key}</span>
                        </Space>
                    }
                    extra={
                        <Space>
                            <Button
                                size="small"
                                aria-label="Move up"
                                icon={<FontAwesomeIcon icon={faArrowUp} />}
                                disabled={index === 0}
                                onClick={() =>
                                    onChange(touch({ ...template, counterDefs: moveOrdered(counters, index, -1) }))
                                }
                            />
                            <Button
                                size="small"
                                aria-label="Move down"
                                icon={<FontAwesomeIcon icon={faArrowDown} />}
                                disabled={index === counters.length - 1}
                                onClick={() =>
                                    onChange(touch({ ...template, counterDefs: moveOrdered(counters, index, 1) }))
                                }
                            />
                            <Popconfirm
                                title="Delete this counter?"
                                description="Saves keep their values hidden until upgraded."
                                onConfirm={() => onChange(deleteCounter(template, counter.key))}
                            >
                                <Button
                                    size="small"
                                    danger
                                    aria-label="Delete counter"
                                    icon={<FontAwesomeIcon icon={faTrash} />}
                                />
                            </Popconfirm>
                        </Space>
                    }
                >
                    <Space wrap align="start">
                        <Select
                            aria-label="Counter type"
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
                                { value: "manual", label: "Manual" },
                                { value: "computed", label: "Computed sum" },
                            ]}
                        />
                        {counter.kind === "computed" && (
                            <Select
                                mode="multiple"
                                aria-label="Sum of"
                                style={{ minWidth: 260 }}
                                placeholder="Counters to add up"
                                value={counter.sumOf ?? []}
                                onChange={sumOf => update(counter.key, { sumOf })}
                                options={template.counterDefs
                                    .filter(c => c.kind === "manual")
                                    .map(c => ({ value: c.key, label: c.label }))}
                            />
                        )}
                        <Select
                            aria-label="Role"
                            allowClear
                            placeholder="No role"
                            style={{ width: 130 }}
                            value={counter.role}
                            onChange={role => update(counter.key, { role })}
                            options={[
                                { value: "owned", label: "Owned" },
                                { value: "target", label: "Target" },
                            ]}
                        />
                        {template.variantDefs.length > 0 && (
                            <Select
                                mode="multiple"
                                aria-label="Variants"
                                allowClear
                                style={{ minWidth: 200 }}
                                placeholder="All variants"
                                value={counter.variants ?? []}
                                onChange={variants =>
                                    update(counter.key, { variants: variants.length > 0 ? variants : undefined })
                                }
                                options={template.variantDefs.map(v => ({ value: v.key, label: v.label }))}
                            />
                        )}
                        {counter.kind === "manual" && (
                            <InputNumber
                                aria-label="Maximum"
                                min={0}
                                precision={0}
                                placeholder="No max"
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
                    aria-label="New counter label"
                    placeholder="New counter, e.g. Inventory"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onPressEnter={add}
                />
                <Button onClick={add} disabled={!newLabel.trim()}>
                    Add counter
                </Button>
            </Space.Compact>
        </div>
    );
};

export { CountersEditor, describeFormula };
