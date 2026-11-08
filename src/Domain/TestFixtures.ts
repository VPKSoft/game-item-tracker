import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { createTemplate } from "./CreateSave.ts";

/** A small fish-like template with variants and a variant-limited counter, for tests. */
const fishTemplate = (): Template => ({
    ...createTemplate("Fish", "Test Game"),
    templateId: "fish-template",
    attributeDefs: [
        {
            key: "rarity",
            label: "Rarity",
            min: 1,
            max: 5,
            levels: [
                { value: 1, label: "Common" },
                { value: 5, label: "Legendary" },
            ],
        },
    ],
    variantDefs: [
        { key: "normal", label: "Normal", order: 0 },
        { key: "starred", label: "Starred", order: 1 },
    ],
    counterDefs: [
        { key: "inventory", label: "Inventory", kind: "manual", order: 0 },
        { key: "placed", label: "Placed", kind: "manual", variants: ["starred"], order: 1 },
        { key: "total", label: "Total", kind: "computed", sumOf: ["inventory", "placed"], role: "owned", order: 2 },
        { key: "target", label: "Target", kind: "manual", role: "target", order: 3 },
        { key: "tradeable", label: "Tradeable", kind: "manual", max: 99, order: 4 },
    ],
    tags: ["coast", "river", "worm"],
    categories: [
        { id: "coast", name: "Coast", order: 0 },
        { id: "rivers", name: "Rivers", order: 1 },
        { id: "upper-rivers", name: "Upper rivers", order: 2, parentId: "rivers" },
    ],
    items: [
        {
            id: "bass",
            categoryId: "coast",
            name: "Bass",
            description: "A bountiful staple fish with a mild flavor.",
            attributes: { rarity: 1 },
            tags: ["coast"],
            defaults: { target: 1 },
        },
        {
            id: "koi",
            categoryId: "rivers",
            name: "Ancient Koi",
            description: "Legends say these lived in the palace ponds.",
            attributes: { rarity: 3 },
            tags: ["river", "worm"],
        },
        {
            id: "eel",
            categoryId: "upper-rivers",
            name: "Albino Eel",
            description: "A pale eel found in caves.",
            attributes: { rarity: 2 },
            tags: ["river"],
            variants: ["normal"],
        },
    ],
});

/** Creates many generated items for performance tests. */
const manyItems = (count: number): TemplateItem[] => {
    const words = ["bass", "koi", "eel", "trout", "carp", "ray", "shark", "perch", "pike", "cod"];
    const items: TemplateItem[] = [];
    for (let i = 0; i < count; i++) {
        items.push({
            id: `item-${i}`,
            categoryId: i % 2 === 0 ? "coast" : "rivers",
            name: `${words[i % words.length]} ${words[(i * 7) % words.length]} ${i}`,
            description: `Description number ${i} about a ${words[(i * 3) % words.length]}.`,
            attributes: { rarity: (i % 5) + 1 },
            tags: [words[(i * 11) % words.length]],
        });
    }
    return items;
};

export { fishTemplate, manyItems };
