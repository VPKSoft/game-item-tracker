import { Divider, Drawer, Input } from "antd";
import * as React from "react";
import { AttributeBadges } from "../Components/AttributeBadges.tsx";
import { CounterRows } from "../Components/ItemCard.tsx";
import { TagEditor } from "../Components/TagEditor.tsx";
import { hasUniqueVariants } from "../Domain/Counters.ts";
import { getEffectiveTags, setEffectiveTags } from "../Domain/EffectiveTags.ts";
import type { SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";

type Props = {
    template: Template;
    item: TemplateItem | undefined;
    saveItem: SaveItem | undefined;
    onClose: () => void;
    onChange: (itemId: string, update: (saveItem: SaveItem) => SaveItem) => void;
    onCounterChange: (itemId: string, variantKey: string, counterKey: string, value: number) => void;
    onObtainedChange: (itemId: string, variantKey: string, obtained: boolean) => void;
};

/** The drawer for one item of a save: all counters, tags and notes. */
const SaveItemDrawer = ({ template, item, saveItem, onClose, onChange, onCounterChange, onObtainedChange }: Props) => {
    // Notes are edited locally and committed on blur and close, so typing does not re-index the search.
    const [notes, setNotes] = React.useState(saveItem?.notes ?? "");
    const itemId = item?.id;
    // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when another item is opened
    React.useEffect(() => {
        setNotes(saveItem?.notes ?? "");
    }, [itemId]);

    const commitNotes = () => {
        if (item && saveItem && notes !== saveItem.notes) {
            onChange(item.id, s => ({ ...s, notes }));
        }
    };

    const image = item?.imageId ? template.images[item.imageId] : undefined;

    return (
        <Drawer
            open={!!item}
            onClose={() => {
                commitNotes();
                onClose();
            }}
            title={item?.name}
            size={420}
            destroyOnHidden
        >
            {item && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", gap: 12 }}>
                        {image && <img src={image} alt="" style={{ maxWidth: 96, maxHeight: 96 }} />}
                        <div>
                            <div>
                                <AttributeBadges attributeDefs={template.attributeDefs} item={item} />
                            </div>
                            <div style={{ marginTop: 6 }}>{item.description}</div>
                        </div>
                    </div>
                    <Divider titlePlacement="start" plain>
                        Amounts
                    </Divider>
                    {template.counterDefs.length === 0 && !hasUniqueVariants(template, item) ? (
                        <div style={{ opacity: 0.7 }}>This template does not define any counters.</div>
                    ) : (
                        <CounterRows
                            template={template}
                            item={item}
                            saveItem={saveItem}
                            onCounterChange={onCounterChange}
                            onObtainedChange={onObtainedChange}
                            size="middle"
                        />
                    )}
                    <Divider titlePlacement="start" plain>
                        Tags
                    </Divider>
                    <TagEditor
                        value={getEffectiveTags(item, saveItem)}
                        suggestions={[...new Set([...item.tags, ...template.tags])]}
                        onChange={tags => onChange(item.id, s => setEffectiveTags(item, s, tags))}
                    />
                    <Divider titlePlacement="start" plain>
                        Notes
                    </Divider>
                    <Input.TextArea
                        aria-label="Notes"
                        autoSize={{ minRows: 3, maxRows: 12 }}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        onBlur={commitNotes}
                        placeholder="Your notes about this item"
                    />
                </div>
            )}
        </Drawer>
    );
};

export { SaveItemDrawer };
