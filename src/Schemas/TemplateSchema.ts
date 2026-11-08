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
    role: z.enum(["owned", "target"]).optional(),
    variants: z.array(keySchema).optional(),
    max: z.number().int().nonnegative().optional(),
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
    deprecated: z.boolean().optional(),
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
    variantDefs: z.array(variantDefSchema),
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
type VariantDef = z.infer<typeof variantDefSchema>;
type Category = z.infer<typeof categorySchema>;
type TemplateItem = z.infer<typeof templateItemSchema>;
type Template = z.infer<typeof templateSchema>;

export type { AttributeDef, Category, CounterDef, Template, TemplateItem, VariantDef };
export { templateFormat, templateSchema, templateSchemaVersion };
