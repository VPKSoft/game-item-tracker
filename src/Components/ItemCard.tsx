import { faImage, faNoteSticky } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Card, Checkbox, Progress, Tag, Tooltip } from "antd";
import classNames from "classnames";
import * as React from "react";
import { styled } from "styled-components";
import {
    findRoleCounter,
    getCounterValue,
    getItemCounterTotal,
    getItemVariants,
    getVariantCounters,
    hasUniqueVariants,
    isObtained,
    isVariantUnique,
    noVariantKey,
} from "../Domain/Counters.ts";
import { getEffectiveTags } from "../Domain/EffectiveTags.ts";
import type { SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { AttributeBadges } from "./AttributeBadges.tsx";
import { CounterStepper } from "./CounterStepper.tsx";

type Props = {
    template: Template;
    item: TemplateItem;
    /** In a save, the user's data; omit in the template editor. */
    saveItem?: SaveItem;
    /** Present in a save: changes one manual counter. */
    onCounterChange?: (itemId: string, variantKey: string, counterKey: string, value: number) => void;
    /** Present in a save: marks a unique variant obtained or not obtained. */
    onObtainedChange?: (itemId: string, variantKey: string, obtained: boolean) => void;
    onOpen: (itemId: string) => void;
    /** Show counter steppers (save mode). */
    showCounters?: boolean;
} & BaseProps;

const CounterRowsRoot = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
    .CounterRows-variant {
        font-size: 0.8em;
        font-weight: 600;
    }
    .CounterRows-counters {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .CounterRows-obtained {
        display: flex;
        align-items: center;
        gap: 6px;
    }
`;

/** The rows of counters of an item, one per variant. Shared by the card and the item drawer. */
const CounterRows = ({
    template,
    item,
    saveItem,
    onCounterChange,
    onObtainedChange,
    size,
}: {
    template: Template;
    item: TemplateItem;
    saveItem?: SaveItem;
    onCounterChange?: Props["onCounterChange"];
    onObtainedChange?: Props["onObtainedChange"];
    size?: "small" | "middle";
}) => {
    const variants = getItemVariants(template, item);
    return (
        <CounterRowsRoot className="CounterRows">
            {variants.map(variant => {
                if (isVariantUnique(item, variant.key)) {
                    const label = variant.key === noVariantKey ? "Obtained" : `${variant.label}: obtained`;
                    return (
                        <div key={variant.key} className="CounterRows-row CounterRows-obtained">
                            <span onClick={e => e.stopPropagation()}>
                                <Checkbox
                                    aria-label={label}
                                    checked={isObtained(saveItem, variant.key)}
                                    disabled={!onObtainedChange}
                                    onChange={e => onObtainedChange?.(item.id, variant.key, e.target.checked)}
                                >
                                    {label}
                                </Checkbox>
                            </span>
                            <Tag color="gold" variant="outlined">
                                Unique
                            </Tag>
                        </div>
                    );
                }
                const counters = getVariantCounters(template, variant.key);
                if (counters.length === 0) {
                    return null;
                }
                return (
                    <div key={variant.key} className="CounterRows-row">
                        {variant.key !== noVariantKey && <div className="CounterRows-variant">{variant.label}</div>}
                        <div className="CounterRows-counters">
                            {counters.map(counter => (
                                <CounterStepper
                                    key={counter.key}
                                    size={size}
                                    label={counter.label}
                                    max={counter.max}
                                    value={getCounterValue(template, saveItem, variant.key, counter.key)}
                                    onChange={
                                        counter.kind === "manual" && onCounterChange
                                            ? v => onCounterChange(item.id, variant.key, counter.key, v)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </CounterRowsRoot>
    );
};

/** A card of one item in the grid. Memoized: only the changed card re-renders. */
let ItemCard = ({
    className,
    template,
    item,
    saveItem,
    onCounterChange,
    onObtainedChange,
    onOpen,
    showCounters,
}: Props) => {
    const image = item.imageId ? template.images[item.imageId] : undefined;
    const tags = getEffectiveTags(item, saveItem);
    const category = template.categories.find(c => c.id === item.categoryId);

    const owned = findRoleCounter(template, "owned");
    const target = findRoleCounter(template, "target");
    const ownedValue = owned ? getItemCounterTotal(template, item, saveItem, owned.key) : 0;
    const targetValue = target ? getItemCounterTotal(template, item, saveItem, target.key) : 0;

    return (
        <Card
            size="small"
            hoverable
            className={classNames(className, "ItemCard")}
            onClick={() => onOpen(item.id)}
            data-testid={`item-card-${item.id}`}
        >
            <div className="ItemCard-header">
                <div className="ItemCard-image">
                    {image ? (
                        <img src={image} alt="" loading="lazy" decoding="async" />
                    ) : (
                        <FontAwesomeIcon icon={faImage} className="ItemCard-noImage" />
                    )}
                </div>
                <div className="ItemCard-title">
                    <div className="ItemCard-name" title={item.name}>
                        {item.name}
                        {saveItem?.notes && (
                            <Tooltip title={saveItem.notes}>
                                <FontAwesomeIcon icon={faNoteSticky} className="ItemCard-noteIcon" />
                            </Tooltip>
                        )}
                    </div>
                    <div className="ItemCard-badges">
                        <AttributeBadges attributeDefs={template.attributeDefs} item={item} />
                        {!showCounters && category && <Tag variant="filled">{category.name}</Tag>}
                        {!showCounters && hasUniqueVariants(template, item) && <Tag color="gold">Unique</Tag>}
                        {item.deprecated && <Tag color="warning">Deprecated</Tag>}
                    </div>
                </div>
            </div>
            {!showCounters && item.description && <div className="ItemCard-description">{item.description}</div>}
            {showCounters && (
                <>
                    <CounterRows
                        template={template}
                        item={item}
                        saveItem={saveItem}
                        onCounterChange={onCounterChange}
                        onObtainedChange={onObtainedChange}
                    />
                    {owned && target && targetValue > 0 && (
                        <Progress
                            size="small"
                            percent={Math.min(100, Math.round((ownedValue / targetValue) * 100))}
                            format={() => `${ownedValue} / ${targetValue}`}
                        />
                    )}
                </>
            )}
            {tags.length > 0 && (
                <div className="ItemCard-tags">
                    {tags.slice(0, 6).map(tag => (
                        <Tag key={tag} className="ItemCard-tag">
                            {tag}
                        </Tag>
                    ))}
                    {tags.length > 6 && <Tag className="ItemCard-tag">+{tags.length - 6}</Tag>}
                </div>
            )}
        </Card>
    );
};

ItemCard = styled(ItemCard)`
    height: 100%;
    .ant-card-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .ItemCard-header {
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }
    .ItemCard-image {
        width: 64px;
        height: 64px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        img {
            max-width: 64px;
            max-height: 64px;
        }
    }
    .ItemCard-noImage {
        font-size: 32px;
        opacity: 0.25;
    }
    .ItemCard-title {
        min-width: 0;
        flex: 1;
    }
    .ItemCard-name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ItemCard-noteIcon {
        margin-left: 6px;
        opacity: 0.7;
    }
    .ItemCard-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 0;
        margin-top: 2px;
    }
    .ItemCard-description {
        font-size: 0.85em;
        opacity: 0.8;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .ItemCard-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 0;
    }
    .ItemCard-tag {
        font-size: 0.75em;
        line-height: 18px;
    }
`;

const MemoItemCard = React.memo(ItemCard);

export { CounterRows, MemoItemCard as ItemCard };
