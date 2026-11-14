import { z } from "zod";
import { templateSchema } from "./TemplateSchema.ts";

/** The format marker stored in every save file. */
const saveFormat = "game-item-tracker/save";

/** The current save file-format version. */
const saveSchemaVersion = 1;

const saveItemSchema = z.object({
    /** counts[variantKey][counterKey]; items without variants use the key "_". */
    counts: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())),
    notes: z.string(),
    removedTags: z.array(z.string()),
    customTags: z.array(z.string()),
    /** The variant keys of unique variants the user has obtained ("_" for items without variants). */
    obtained: z.array(z.string()).optional(),
    /**
     * Set when the item was deleted from the template. The entry stays in the save until the user removes it;
     * `name` keeps enough to show it and `removedIn` is the template version that no longer had the item.
     */
    orphan: z.object({ name: z.string(), removedIn: z.string().optional() }).optional(),
});

const saveSchema = z.object({
    format: z.literal(saveFormat),
    schemaVersion: z.literal(saveSchemaVersion),
    saveId: z.string().min(1),
    name: z.string().min(1),
    template: z.object({
        templateId: z.string().min(1),
        version: z.string(),
        name: z.string(),
        game: z.string(),
    }),
    updatedAt: z.string(),
    items: z.record(z.string(), saveItemSchema),
    /** An optional embedded template so a single file can be moved between devices. */
    bundle: templateSchema.optional(),
});

type SaveItem = z.infer<typeof saveItemSchema>;
type Save = z.infer<typeof saveSchema>;

export type { Save, SaveItem };
export { saveFormat, saveSchema, saveSchemaVersion };
