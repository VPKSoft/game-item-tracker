import { Alert, Checkbox, Form, InputNumber, Modal, Select } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { getBulkCounters, getBulkVariants, setCounterForItems } from "../Domain/BulkEdits.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";

/** The counter, variant (undefined = all) and value chosen in the dialog. */
type SetCounterChoice = { counterKey: string; variantKey?: string; value: number };

type Props = {
    open: boolean;
    template: Template;
    save: Save;
    /** The selected item ids. */
    itemIds: ReadonlySet<string>;
    onCancel: () => void;
    onApply: (choice: SetCounterChoice) => void;
};

const allVariants = "";

/** Asks for a counter, an optional variant and a value, and previews how many selected items it sets. */
const SetCounterDialog = ({ open, template, save, itemIds, onCancel, onApply }: Props) => {
    const { t } = useTranslation();
    const counters = React.useMemo(() => getBulkCounters(template), [template]);
    const [counterKey, setCounterKey] = React.useState<string | undefined>(undefined);
    const [variantKey, setVariantKey] = React.useState(allVariants);
    const [value, setValue] = React.useState(0);

    const counter = counters.find(c => c.key === counterKey) ?? counters[0];
    const variants = React.useMemo(() => (counter ? getBulkVariants(template, counter) : []), [template, counter]);
    const variant = variants.some(v => v.key === variantKey) ? variantKey : allVariants;
    // A counter with a maximum of 1 is a checkbox, as on the cards; the value kept from another counter is capped.
    const checkbox = counter?.max === 1;
    const effectiveValue = counter?.max !== undefined ? Math.min(value, counter.max) : value;

    // A preview with the real edit, so the counts match what OK does.
    const preview = React.useMemo(
        () =>
            open && counter
                ? setCounterForItems(template, save, itemIds, counter.key, effectiveValue, variant || undefined)
                : undefined,
        [open, template, save, itemIds, counter, effectiveValue, variant]
    );

    return (
        <Modal
            open={open}
            title={t("selection.dialogTitle")}
            okText={t("selection.apply")}
            okButtonProps={{ disabled: !preview || preview.changed.length === 0 }}
            onCancel={onCancel}
            onOk={() =>
                counter && onApply({ counterKey: counter.key, variantKey: variant || undefined, value: effectiveValue })
            }
            destroyOnHidden
        >
            {counter ? (
                <Form layout="vertical">
                    <Form.Item label={t("selection.counter")}>
                        <Select
                            aria-label={t("selection.counter")}
                            value={counter.key}
                            onChange={setCounterKey}
                            options={counters.map(c => ({ value: c.key, label: c.label }))}
                        />
                    </Form.Item>
                    {variants.length > 0 && (
                        <Form.Item label={t("selection.variant")}>
                            <Select
                                aria-label={t("selection.variant")}
                                value={variant}
                                onChange={setVariantKey}
                                options={[
                                    { value: allVariants, label: t("selection.allVariants") },
                                    ...variants.map(v => ({ value: v.key, label: v.label })),
                                ]}
                            />
                        </Form.Item>
                    )}
                    {checkbox ? (
                        <Form.Item label={t("selection.value")}>
                            <Checkbox checked={effectiveValue >= 1} onChange={e => setValue(e.target.checked ? 1 : 0)}>
                                {counter.label}
                            </Checkbox>
                        </Form.Item>
                    ) : (
                        <Form.Item label={t("selection.value")} extra={t("selection.capped")}>
                            <InputNumber
                                aria-label={t("selection.value")}
                                min={0}
                                max={counter.max}
                                precision={0}
                                value={effectiveValue}
                                onChange={v => setValue(typeof v === "number" ? v : 0)}
                            />
                        </Form.Item>
                    )}
                    {preview && (
                        <Alert
                            type={preview.skipped.length > 0 ? "warning" : "info"}
                            showIcon
                            title={t("selection.willChange", {
                                counter: counter.label,
                                value: checkbox
                                    ? effectiveValue >= 1
                                        ? t("selection.checked")
                                        : t("selection.unchecked")
                                    : effectiveValue,
                                count: preview.changed.length,
                            })}
                            description={
                                preview.skipped.length > 0
                                    ? t("selection.willSkip", { count: preview.skipped.length })
                                    : undefined
                            }
                        />
                    )}
                </Form>
            ) : (
                <Alert type="info" showIcon title={t("selection.noCounters")} />
            )}
        </Modal>
    );
};

export type { SetCounterChoice };
export { SetCounterDialog };
