import { Alert, App, Checkbox, Modal } from "antd";
import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { upgradeSave } from "../Domain/UpgradeSave.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";

type Props = {
    open: boolean;
    save: Save;
    oldTemplate: Template | undefined;
    newTemplate: Template | undefined;
    onCancel: () => void;
    onUpgrade: (save: Save, template: Template) => void;
};

const list = (t: TFunction, label: string, values: string[]) =>
    values.length > 0 ? (
        <li>
            {label}:{" "}
            {values.length <= 8
                ? values.join(", ")
                : t("upgrade.andMore", { list: values.slice(0, 8).join(", "), count: values.length - 8 })}
        </li>
    ) : null;

/** Previews and applies the upgrade of a save to a newer template version. */
const UpgradeDialog = ({ open, save, oldTemplate, newTemplate, onCancel, onUpgrade }: Props) => {
    const [discardHidden, setDiscardHidden] = React.useState(false);
    const { t } = useTranslation();
    const { modal } = App.useApp();
    const preview = React.useMemo(
        () => (newTemplate ? upgradeSave(save, oldTemplate, newTemplate, { discardHidden }) : null),
        [save, oldTemplate, newTemplate, discardHidden]
    );
    if (!preview || !newTemplate) {
        return null;
    }
    const { summary } = preview;
    const name = (id: string) =>
        newTemplate.items.find(i => i.id === id)?.name ?? oldTemplate?.items.find(i => i.id === id)?.name ?? id;
    const hasHidden = summary.removedCounters.length > 0 || summary.removedVariants.length > 0;
    const counterLabel = (key: string) => oldTemplate?.counterDefs.find(c => c.key === key)?.label ?? key;
    const variantLabel = (key: string) => oldTemplate?.variantDefs.find(v => v.key === key)?.label ?? key;
    const affected = (label: string, count: number) =>
        count > 0 ? t("upgrade.withValues", { label, count }) : t("upgrade.withoutValues", { label });
    const losesData =
        discardHidden &&
        [...Object.values(summary.removedCounterData), ...Object.values(summary.removedVariantData)].some(n => n > 0);

    const upgrade = () => {
        if (!losesData) {
            onUpgrade(preview.save, newTemplate);
            return;
        }
        modal.confirm({
            title: t("upgrade.confirmDiscardTitle"),
            content: `${t("upgrade.confirmDiscardContent")} ${t("common.cannotBeUndone")}`,
            okText: t("upgrade.upgrade"),
            okButtonProps: { danger: true },
            onOk: () => onUpgrade(preview.save, newTemplate),
        });
    };

    return (
        <Modal
            open={open}
            title={t("upgrade.title", { name: newTemplate.name, version: newTemplate.version })}
            okText={t("upgrade.upgrade")}
            onCancel={onCancel}
            okButtonProps={{ danger: losesData }}
            onOk={upgrade}
        >
            <p>{t("upgrade.fromTo", { from: summary.fromVersion, to: summary.toVersion })}</p>
            <ul>
                {list(t, t("upgrade.newItems"), summary.addedItems.map(name))}
                {list(t, t("upgrade.removedItems"), summary.removedItems.map(name))}
                {list(t, t("upgrade.deprecatedItems"), summary.deprecatedItems.map(name))}
                {list(
                    t,
                    t("upgrade.newCounters"),
                    summary.addedCounters.map(k => newTemplate.counterDefs.find(c => c.key === k)?.label ?? k)
                )}
                {list(
                    t,
                    t("upgrade.newVariants"),
                    summary.addedVariants.map(k => newTemplate.variantDefs.find(v => v.key === k)?.label ?? k)
                )}
            </ul>
            {hasHidden && (
                <Alert
                    type="warning"
                    showIcon
                    title={t("upgrade.removedWarning")}
                    description={
                        <>
                            <ul className="UpgradeDialog-removed">
                                {summary.removedCounters.map(key => (
                                    <li key={`counter:${key}`}>
                                        {t("upgrade.removedCounter", {
                                            text: affected(counterLabel(key), summary.removedCounterData[key] ?? 0),
                                        })}
                                    </li>
                                ))}
                                {summary.removedVariants.map(key => (
                                    <li key={`variant:${key}`}>
                                        {t("upgrade.removedVariant", {
                                            text: affected(variantLabel(key), summary.removedVariantData[key] ?? 0),
                                        })}
                                    </li>
                                ))}
                            </ul>
                            <p>{t(discardHidden ? "upgrade.valuesDiscarded" : "upgrade.valuesHidden")}</p>
                            <Checkbox checked={discardHidden} onChange={e => setDiscardHidden(e.target.checked)}>
                                {t("upgrade.discardHidden")}
                            </Checkbox>
                        </>
                    }
                />
            )}
        </Modal>
    );
};

export { UpgradeDialog };
