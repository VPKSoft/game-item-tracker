import { catalogFileUrl } from "../Domain/Catalog.ts";
import { type CatalogEntry, catalogSchema } from "../Schemas/CatalogSchema.ts";
import { LocalizedError } from "../Types/LocalizedMessage.ts";
import { fileMessages, parseFileText } from "./FileFormat.ts";

/**
 * The catalog of the community template repository (`game-item-tracker-data`), published to GitHub Pages by
 * that repository's workflow. `VITE_CATALOG_URL` overrides it, e.g. for a local copy of the site.
 */
const defaultCatalogUrl = "https://vpksoft.github.io/game-item-tracker-data/index.json";

/** The "Submit a template" issue form of the template repository, where people share templates without git. */
const templateSubmissionUrl =
    "https://github.com/VPKSoft/game-item-tracker-data/issues/new?template=submit-template.yml";

/** The catalog URL in use. */
const catalogUrl = import.meta.env.VITE_CATALOG_URL || defaultCatalogUrl;

/** English templates of the online catalog messages. The UI translates them by key (`messages.<key>`). */
const catalogMessages = {
    catalogUnavailable: "The online template list could not be loaded ({{details}}).",
    catalogInvalid: "The online template list is in an unknown format. Reload the app to get the newest version.",
    onlineTemplateUnavailable: "The template could not be downloaded ({{details}}).",
    onlineTemplateMismatch: "The downloaded file is not {{name}} v{{version}}. Try again later.",
} as const;

/** The code of an online catalog message. */
type CatalogMessageCode = keyof typeof catalogMessages;

const describeFailure = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Fetches a text file, revalidating any cached copy so that newly published templates show up at once. */
const fetchText = async (url: string, code: "catalogUnavailable" | "onlineTemplateUnavailable") => {
    let response: Response;
    try {
        response = await fetch(url, { cache: "no-cache" });
    } catch (error) {
        throw new LocalizedError(catalogMessages, code, { details: describeFailure(error) });
    }
    if (!response.ok) {
        throw new LocalizedError(catalogMessages, code, { details: `HTTP ${response.status}` });
    }
    return response.text();
};

/** Downloads and validates the template catalog. Throws a {@link LocalizedError} on failure. */
const fetchCatalog = async (url = catalogUrl) => {
    const text = await fetchText(url, "catalogUnavailable");
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        throw new LocalizedError(catalogMessages, "catalogInvalid");
    }
    const result = catalogSchema.safeParse(json);
    if (!result.success) {
        throw new LocalizedError(catalogMessages, "catalogInvalid");
    }
    return result.data;
};

/**
 * Downloads a template listed in the catalog and checks that it is the listed template version.
 * Throws a {@link LocalizedError} on failure.
 */
const fetchCatalogTemplate = async (entry: CatalogEntry, url = catalogUrl) => {
    const parsed = parseFileText(await fetchText(catalogFileUrl(url, entry.path), "onlineTemplateUnavailable"));
    if (parsed.kind === "error") {
        throw new LocalizedError(fileMessages, parsed.code, parsed.params);
    }
    if (
        parsed.kind !== "template" ||
        parsed.template.templateId !== entry.templateId ||
        parsed.template.version !== entry.version
    ) {
        throw new LocalizedError(catalogMessages, "onlineTemplateMismatch", {
            name: entry.name,
            version: entry.version,
        });
    }
    return parsed.template;
};

export type { CatalogMessageCode };
export { catalogMessages, catalogUrl, defaultCatalogUrl, fetchCatalog, fetchCatalogTemplate, templateSubmissionUrl };
