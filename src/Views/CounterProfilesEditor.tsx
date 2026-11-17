import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Card, Input, InputNumber, Popconfirm, Select, Space, Table, Typography } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { uniqueId } from "../Domain/Ids.ts";
import { deleteCounterProfile, setCounterOverride, upsertCounterProfile } from "../Domain/TemplateEdits.ts";
import type { CounterDef, CounterOverride, CounterProfile, Template } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    onChange: (template: Template) => void;
};

/** The value of the "use" select for a counter without an override. */
const shown = "shown";

/** The choices of the "use" select. */
type UseChoice = typeof shown | NonNullable<CounterOverride["use"]>;

/**
 * Edits the counter profiles of a template: named sets of overrides that hide, turn off, fix or cap counters for
 * the categories and items that use them.
 */
const CounterProfilesEditor = ({ template, onChange }: Props) => {
    const [newLabel, setNewLabel] = React.useState("");
    const { t } = useTranslation();
    const profiles = template.counterProfiles ?? [];
    const counters = [...template.counterDefs].sort((a, b) => a.order - b.order);

    const add = () => {
        const label = newLabel.trim();
        if (!label) {
            return;
        }
        const key = uniqueId(
            label,
            profiles.map(p => p.key)
        );
        onChange(upsertCounterProfile(template, { key, label, overrides: {} }));
        setNewLabel("");
    };

    const setOverride = (profile: CounterProfile, counterKey: string, patch: Partial<CounterOverride>) => {
        const current = profile.overrides[counterKey] ?? {};
        onChange(upsertCounterProfile(template, setCounterOverride(profile, counterKey, { ...current, ...patch })));
    };

    const usage = (key: string) => ({
        categories: template.categories.filter(c => c.counterProfile === key).length,
        items: template.items.filter(i => i.counterProfile === key).length,
    });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Typography.Title level={5} style={{ margin: "12px 0 0" }}>
                {t("profiles.title")}
            </Typography.Title>
            <p style={{ margin: 0 }}>{t("profiles.help")}</p>
            {profiles.map(profile => (
                <Card
                    key={profile.key}
                    size="small"
                    title={
                        <Space>
                            <Input
                                aria-label={t("profiles.profileLabel")}
                                value={profile.label}
                                onChange={e =>
                                    onChange(upsertCounterProfile(template, { ...profile, label: e.target.value }))
                                }
                                style={{ width: 180 }}
                            />
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                                {t("common.key", { key: profile.key })}
                            </span>
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                                {t("profiles.usedBy", usage(profile.key))}
                            </span>
                        </Space>
                    }
                    extra={
                        <Popconfirm
                            title={t("profiles.deleteTitle")}
                            description={t("profiles.deleteDescription")}
                            onConfirm={() => onChange(deleteCounterProfile(template, profile.key))}
                        >
                            <Button
                                size="small"
                                danger
                                aria-label={t("profiles.deleteProfile")}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                            />
                        </Popconfirm>
                    }
                >
                    <Table<CounterDef>
                        size="small"
                        rowKey="key"
                        pagination={false}
                        dataSource={counters}
                        columns={[
                            { title: t("profiles.counter"), render: (_, c) => c.label },
                            {
                                title: t("profiles.use"),
                                width: 150,
                                render: (_, c) => (
                                    <Select
                                        aria-label={t("profiles.useOf", { counter: c.label })}
                                        style={{ width: "100%" }}
                                        value={profile.overrides[c.key]?.use ?? shown}
                                        onChange={(use: UseChoice) =>
                                            setOverride(profile, c.key, { use: use === shown ? undefined : use })
                                        }
                                        options={[
                                            { value: shown, label: t("profiles.shown") },
                                            { value: "hidden", label: t("profiles.hidden") },
                                            { value: "off", label: t("profiles.off") },
                                        ]}
                                    />
                                ),
                            },
                            {
                                title: t("profiles.fixedValue"),
                                width: 120,
                                render: (_, c) =>
                                    c.kind === "manual" && (
                                        <InputNumber
                                            aria-label={t("profiles.fixedValueOf", { counter: c.label })}
                                            min={0}
                                            precision={0}
                                            placeholder={t("profiles.notFixed")}
                                            disabled={profile.overrides[c.key]?.use === "off"}
                                            value={profile.overrides[c.key]?.value}
                                            onChange={value =>
                                                setOverride(profile, c.key, {
                                                    value: typeof value === "number" ? value : undefined,
                                                })
                                            }
                                        />
                                    ),
                            },
                            {
                                title: t("common.maximum"),
                                width: 120,
                                render: (_, c) =>
                                    c.kind === "manual" && (
                                        <InputNumber
                                            aria-label={t("profiles.maximumOf", { counter: c.label })}
                                            min={0}
                                            precision={0}
                                            placeholder={t("profiles.counterMax")}
                                            disabled={profile.overrides[c.key]?.use === "off"}
                                            value={profile.overrides[c.key]?.max}
                                            onChange={max =>
                                                setOverride(profile, c.key, {
                                                    max: typeof max === "number" ? max : undefined,
                                                })
                                            }
                                        />
                                    ),
                            },
                        ]}
                    />
                </Card>
            ))}
            <Space.Compact style={{ maxWidth: 400 }}>
                <Input
                    aria-label={t("profiles.newProfileLabel")}
                    placeholder={t("profiles.newProfilePlaceholder")}
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onPressEnter={add}
                />
                <Button onClick={add} disabled={!newLabel.trim()}>
                    {t("profiles.addProfile")}
                </Button>
            </Space.Compact>
        </div>
    );
};

export { CounterProfilesEditor };
