import { Alert, Form, InputNumber, Modal, Select } from "antd";
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

    // A preview with the real edit, so the counts match what OK does.
    const preview = React.useMemo(
        () =>
            open && counter
                ? setCounterForItems(template, save, itemIds, counter.key, value, variant || undefined)
                : undefined,
        [open, template, save, itemIds, counter, value, variant]
    );

    return (
        <Modal
            open={open}
            title={t("selection.dialogTitle")}
            okText={t("selection.apply")}
            okButtonProps={{ disabled: !preview || preview.changed.length === 0 }}
            onCancel={onCancel}
            onOk={() => counter && onApply({ counterKey: counter.key, variantKey: variant || undefined, value })}
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
                    <Form.Item label={t("selection.value")} extra={t("selection.capped")}>
                        <InputNumber
                            aria-label={t("selection.value")}
                            min={0}
                            max={counter.max}
                            precision={0}
                            value={value}
                            onChange={v => setValue(typeof v === "number" ? v : 0)}
                        />
                    </Form.Item>
                    {preview && (
                        <Alert
                            type={preview.skipped.length > 0 ? "warning" : "info"}
                            showIcon
                            title={t("selection.willChange", {
                                counter: counter.label,
                                value,
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
