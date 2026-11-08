import { Checkbox, Modal } from "antd";
import * as React from "react";
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

const list = (label: string, values: string[]) =>
    values.length > 0 ? (
        <li>
            {label}:{" "}
            {values.length <= 8 ? values.join(", ") : `${values.slice(0, 8).join(", ")} and ${values.length - 8} more`}
        </li>
    ) : null;

/** Previews and applies the upgrade of a save to a newer template version. */
const UpgradeDialog = ({ open, save, oldTemplate, newTemplate, onCancel, onUpgrade }: Props) => {
    const [discardHidden, setDiscardHidden] = React.useState(false);
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
            title={`Upgrade to ${newTemplate.name} v${newTemplate.version}`}
            okText="Upgrade"
            onCancel={onCancel}
            onOk={() => onUpgrade(preview.save, newTemplate)}
        >
            <p>
                From v{summary.fromVersion} to v{summary.toVersion}. Your amounts, tags and notes are kept.
            </p>
            <ul>
                {list("New items", summary.addedItems.map(name))}
                {list("Obsolete items (kept, marked obsolete)", summary.obsoleteItems.map(name))}
                {list("New counters", summary.addedCounters)}
                {list("Removed counters (values hidden)", summary.removedCounters)}
                {list("New variants", summary.addedVariants)}
                {list("Removed variants (values hidden)", summary.removedVariants)}
            </ul>
            {hasHidden && (
                <Checkbox checked={discardHidden} onChange={e => setDiscardHidden(e.target.checked)}>
                    Discard the hidden values of removed counters and variants
                </Checkbox>
            )}
        </Modal>
    );
};

export { UpgradeDialog };
