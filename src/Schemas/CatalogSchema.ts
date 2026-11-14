import { z } from "zod";
import { templateSchema } from "./TemplateSchema.ts";

/** The format marker of the online template catalog (`index.json` of the template site). */
const catalogFormat = "game-item-tracker/catalog";

/** The current catalog format version. */
const catalogSchemaVersion = 1;

/** One template file listed in the catalog. */
const catalogEntrySchema = z.object({
    templateId: templateSchema.shape.templateId,
    version: templateSchema.shape.version,
    name: templateSchema.shape.name,
    game: templateSchema.shape.game,
    description: templateSchema.shape.description,
    itemCount: z.number().int().nonnegative(),
    updatedAt: z.string(),
    /** The file path relative to the catalog URL, with `/` separators and not URL-encoded, e.g. `P/Palia/palia-fish.gitemplate.json`. */
    path: z.string().min(1),
    /** The file size in bytes. */
    size: z.number().int().nonnegative(),
    source: templateSchema.shape.source,
});

const catalogSchema = z.object({
    format: z.literal(catalogFormat),
    schemaVersion: z.literal(catalogSchemaVersion),
    generatedAt: z.string(),
    templates: z.array(catalogEntrySchema),
});

type CatalogEntry = z.infer<typeof catalogEntrySchema>;
type Catalog = z.infer<typeof catalogSchema>;

export type { Catalog, CatalogEntry };
export { catalogEntrySchema, catalogFormat, catalogSchema, catalogSchemaVersion };
