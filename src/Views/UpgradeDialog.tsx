import { Checkbox, Modal } from "antd";
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

    return (
        <Modal
            open={open}
            title={t("upgrade.title", { name: newTemplate.name, version: newTemplate.version })}
            okText={t("upgrade.upgrade")}
            onCancel={onCancel}
            onOk={() => onUpgrade(preview.save, newTemplate)}
        >
            <p>{t("upgrade.fromTo", { from: summary.fromVersion, to: summary.toVersion })}</p>
            <ul>
                {list(t, t("upgrade.newItems"), summary.addedItems.map(name))}
                {list(t, t("upgrade.obsoleteItems"), summary.obsoleteItems.map(name))}
                {list(t, t("upgrade.newCounters"), summary.addedCounters)}
                {list(t, t("upgrade.removedCounters"), summary.removedCounters)}
                {list(t, t("upgrade.newVariants"), summary.addedVariants)}
                {list(t, t("upgrade.removedVariants"), summary.removedVariants)}
            </ul>
            {hasHidden && (
                <Checkbox checked={discardHidden} onChange={e => setDiscardHidden(e.target.checked)}>
                    {t("upgrade.discardHidden")}
                </Checkbox>
            )}
        </Modal>
    );
};

export { UpgradeDialog };
