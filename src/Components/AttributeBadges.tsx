import { Tag } from "antd";
import type { AttributeDef, TemplateItem } from "../Schemas/TemplateSchema.ts";

/** Colors for levels without an explicit color, from lowest to highest. */
const levelColors = ["default", "green", "blue", "purple", "gold", "red", "magenta"];

/** Gets the display text and color of an attribute value. */
const describeAttribute = (def: AttributeDef, value: number) => {
    const level = def.levels?.find(l => l.value === value);
    if (level) {
        const index = def.levels ? [...def.levels].sort((a, b) => a.value - b.value).indexOf(level) : 0;
        return { text: level.label, color: level.color ?? levelColors[Math.min(index, levelColors.length - 1)] };
    }
    return { text: `${def.label}: ${value}`, color: "default" };
};

type Props = {
    attributeDefs: AttributeDef[];
    item: TemplateItem;
};

/** Shows the numeric attributes of an item as read-only tags. */
const AttributeBadges = ({ attributeDefs, item }: Props) => (
    <>
        {attributeDefs
            .filter(def => item.attributes[def.key] !== undefined)
            .map(def => {
                const { text, color } = describeAttribute(def, item.attributes[def.key]);
                return (
                    <Tag key={def.key} color={color} title={def.label} variant="filled">
                        {text}
                    </Tag>
                );
            })}
    </>
);

export { AttributeBadges, describeAttribute };
