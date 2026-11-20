import { z } from "zod";

/** The format marker stored in every template file. */
const templateFormat = "game-item-tracker/template";

/** The current template file-format version. */
const templateSchemaVersion = 1;

const keySchema = z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Keys may contain only letters, digits, '-' and '_'");

const attributeLevelSchema = z.object({
    value: z.number(),
    label: z.string().min(1),
    color: z.string().optional(),
});

const attributeDefSchema = z.object({
    key: keySchema,
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().positive().optional(),
    levels: z.array(attributeLevelSchema).optional(),
});

const counterDefSchema = z.object({
    key: keySchema,
    label: z.string().min(1),
    kind: z.enum(["manual", "computed"]),
    sumOf: z.array(keySchema).optional(),
    /**
     * `owned` and `target` drive progress bars, the missing filter and exchange suggestions. `planned` is how many
     * of the item the user plans to make or get: the materials list multiplies the item's `materials` by it.
     */
    role: z.enum(["owned", "target", "planned"]).optional(),
    variants: z.array(keySchema).optional(),
    max: z.number().int().nonnegative().optional(),
    /**
     * Manual only: the value comes from the template item's `defaults` and cannot be changed in a save,
     * e.g. how many of an item a bundle needs. It is never stored in saves.
     */
    readOnly: z.literal(true).optional(),
    /**
     * Manual only: the maximum is the item's value of this read-only counter instead of a fixed `max`,
     * e.g. at most as many placed as the bundle needs.
     */
    maxFrom: keySchema.optional(),
    order: z.number(),
});

/**
 * How a counter profile changes one counter for the items it applies to. `use: "hidden"` keeps the counter in
 * effect (value, role, progress) but does not show it; `use: "off"` removes it from the items (value 0, no role).
 * `value` (manual only) fixes the value: the counter is read-only for those items and not stored in saves.
 * `max` (manual only) replaces the counter's `max` or `maxFrom`.
 */
const counterOverrideSchema = z.object({
    use: z.enum(["hidden", "off"]).optional(),
    value: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
});

/** A named set of counter overrides that categories and items can use, e.g. "Single" or "No counters". */
const counterProfileSchema = z.object({
    key: keySchema,
    label: z.string().min(1),
    overrides: z.record(z.string(), counterOverrideSchema),
});

/** Something items are made from, e.g. an ingredient. Items list how many of each material one of them needs. */
const materialSchema = z.object({
    id: keySchema,
    name: z.string().min(1),
    imageId: z.string().optional(),
    order: z.number(),
});

const variantDefSchema = z.object({
    key: keySchema,
    label: z.string().min(1),
    order: z.number(),
});

const categorySchema = z.object({
    id: keySchema,
    name: z.string().min(1),
    order: z.number(),
    parentId: keySchema.optional(),
    /** The counter profile of the category's items; child categories without their own profile inherit it. */
    counterProfile: keySchema.optional(),
});

const templateItemSchema = z.object({
    id: keySchema,
    categoryId: keySchema,
    name: z.string().min(1),
    description: z.string(),
    imageId: z.string().optional(),
    attributes: z.record(z.string(), z.number()),
    tags: z.array(z.string()),
    variants: z.array(keySchema).optional(),
    defaults: z.record(z.string(), z.number().int().nonnegative()).optional(),
    /**
     * Marks the item as unique: it is either obtained or not, and has no counters in a save.
     * `true` makes every variant unique; a list makes only those variants unique.
     */
    unique: z.union([z.literal(true), z.array(keySchema)]).optional(),
    deprecated: z.boolean().optional(),
    /** The counter profile of the item; overrides the profile of its category. */
    counterProfile: keySchema.optional(),
    /** Material id -> how many of that material one of this item needs. */
    materials: z.record(z.string(), z.number().int().positive()).optional(),
});

const templateSchema = z.object({
    format: z.literal(templateFormat),
    schemaVersion: z.literal(templateSchemaVersion),
    templateId: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be in the form MAJOR.MINOR.PATCH"),
    game: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
    updatedAt: z.string(),
    attributeDefs: z.array(attributeDefSchema),
    counterDefs: z.array(counterDefSchema),
    /** Named counter overrides that categories and items refer to by key. */
    counterProfiles: z.array(counterProfileSchema).optional(),
    variantDefs: z.array(variantDefSchema),
    /** The materials items can need (see `TemplateItem.materials` and the `planned` counter role). */
    materials: z.array(materialSchema).optional(),
    /**
     * Replaces the "Materials" text of the save's materials button and panel, e.g. "Ingredients". Template text,
     * so it is shown as is in every UI language; omitted = the translated default.
     */
    materialsLabel: z.string().min(1).optional(),
    tags: z.array(z.string()),
    categories: z.array(categorySchema),
    items: z.array(templateItemSchema),
    images: z.record(z.string(), z.string()),
    source: z
        .object({
            name: z.string(),
            url: z.string(),
            license: z.string().optional(),
        })
        .optional(),
});

type AttributeDef = z.infer<typeof attributeDefSchema>;
type CounterDef = z.infer<typeof counterDefSchema>;
type CounterOverride = z.infer<typeof counterOverrideSchema>;
type CounterProfile = z.infer<typeof counterProfileSchema>;
type VariantDef = z.infer<typeof variantDefSchema>;
type Material = z.infer<typeof materialSchema>;
type CounterRole = NonNullable<CounterDef["role"]>;
type Category = z.infer<typeof categorySchema>;
type TemplateItem = z.infer<typeof templateItemSchema>;
type Template = z.infer<typeof templateSchema>;

export type {
    AttributeDef,
    Category,
    CounterDef,
    CounterOverride,
    CounterProfile,
    CounterRole,
    Material,
    Template,
    TemplateItem,
    VariantDef,
};
export { templateFormat, templateSchema, templateSchemaVersion };
