import type { Template } from "../Schemas/TemplateSchema.ts";

/** A single problem found in a template. */
type ValidationIssue = {
    /** Where the problem is, e.g. "counterDefs.total" or "items.bahari-bass". */
    path: string;
    message: string;
};

const findDuplicates = (values: string[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }
    return [...duplicates];
};

/**
 * Validates the internal consistency of a template (references, uniqueness, ranges).
 * The structural shape is validated separately by the Zod schema.
 */
const validateTemplate = (template: Template): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    for (const id of findDuplicates(template.categories.map(c => c.id))) {
        issues.push({ path: `categories.${id}`, message: `Duplicate category id "${id}"` });
    }
    for (const id of findDuplicates(template.items.map(i => i.id))) {
        issues.push({ path: `items.${id}`, message: `Duplicate item id "${id}"` });
    }
    for (const key of findDuplicates(template.counterDefs.map(c => c.key))) {
        issues.push({ path: `counterDefs.${key}`, message: `Duplicate counter key "${key}"` });
    }
    for (const key of findDuplicates(template.variantDefs.map(v => v.key))) {
        issues.push({ path: `variantDefs.${key}`, message: `Duplicate variant key "${key}"` });
    }
    for (const key of findDuplicates(template.attributeDefs.map(a => a.key))) {
        issues.push({ path: `attributeDefs.${key}`, message: `Duplicate attribute key "${key}"` });
    }

    const categoryIds = new Set(template.categories.map(c => c.id));
    for (const category of template.categories) {
        if (category.parentId !== undefined) {
            if (!categoryIds.has(category.parentId)) {
                issues.push({
                    path: `categories.${category.id}`,
                    message: `Unknown parent category "${category.parentId}"`,
                });
            } else if (category.parentId === category.id) {
                issues.push({ path: `categories.${category.id}`, message: "A category cannot be its own parent" });
            }
        }
    }

    const variantKeys = new Set(template.variantDefs.map(v => v.key));
    const manualKeys = new Set(template.counterDefs.filter(c => c.kind === "manual").map(c => c.key));
    const counterKeys = new Set(template.counterDefs.map(c => c.key));

    for (const role of ["owned", "target"] as const) {
        const withRole = template.counterDefs.filter(c => c.role === role);
        if (withRole.length > 1) {
            issues.push({
                path: `counterDefs.${withRole[1].key}`,
                message: `Only one counter can have the role "${role}"`,
            });
        }
    }

    for (const counter of template.counterDefs) {
        const path = `counterDefs.${counter.key}`;
        if (counter.kind === "computed") {
            if (!counter.sumOf || counter.sumOf.length === 0) {
                issues.push({ path, message: `Computed counter "${counter.label}" does not sum any counters` });
            }
            for (const key of counter.sumOf ?? []) {
                if (!counterKeys.has(key)) {
                    issues.push({ path, message: `Computed counter "${counter.label}" sums unknown counter "${key}"` });
                } else if (!manualKeys.has(key)) {
                    issues.push({
                        path,
                        message: `Computed counter "${counter.label}" can only sum manual counters ("${key}" is computed)`,
                    });
                }
            }
            if (counter.max !== undefined) {
                issues.push({ path, message: `Computed counter "${counter.label}" cannot have a maximum` });
            }
        } else if (counter.sumOf && counter.sumOf.length > 0) {
            issues.push({ path, message: `Manual counter "${counter.label}" cannot have a sum` });
        }
        for (const key of counter.variants ?? []) {
            if (!variantKeys.has(key)) {
                issues.push({ path, message: `Counter "${counter.label}" refers to unknown variant "${key}"` });
            }
        }
    }

    for (const attribute of template.attributeDefs) {
        if (attribute.min > attribute.max) {
            issues.push({
                path: `attributeDefs.${attribute.key}`,
                message: `Attribute "${attribute.label}" has a minimum greater than its maximum`,
            });
        }
    }

    for (const item of template.items) {
        const path = `items.${item.id}`;
        if (!categoryIds.has(item.categoryId)) {
            issues.push({ path, message: `Item "${item.name}" refers to unknown category "${item.categoryId}"` });
        }
        if (item.imageId !== undefined && !(item.imageId in template.images)) {
            issues.push({ path, message: `Item "${item.name}" refers to a missing image` });
        }
        for (const key of item.variants ?? []) {
            if (!variantKeys.has(key)) {
                issues.push({ path, message: `Item "${item.name}" refers to unknown variant "${key}"` });
            }
        }
        if (Array.isArray(item.unique)) {
            for (const key of item.unique) {
                if (!variantKeys.has(key)) {
                    issues.push({ path, message: `Item "${item.name}" marks unknown variant "${key}" as unique` });
                } else if (item.variants && !item.variants.includes(key)) {
                    issues.push({
                        path,
                        message: `Item "${item.name}" marks variant "${key}" as unique but does not have it`,
                    });
                }
            }
        }
        for (const [key, value] of Object.entries(item.attributes)) {
            const def = template.attributeDefs.find(a => a.key === key);
            if (!def) {
                issues.push({ path, message: `Item "${item.name}" has unknown attribute "${key}"` });
            } else if (value < def.min || value > def.max) {
                issues.push({
                    path,
                    message: `Item "${item.name}" has ${def.label} ${value}, outside ${def.min}–${def.max}`,
                });
            }
        }
        for (const key of Object.keys(item.defaults ?? {})) {
            if (!manualKeys.has(key)) {
                issues.push({ path, message: `Item "${item.name}" has a default for unknown manual counter "${key}"` });
            }
        }
    }

    return issues;
};

export type { ValidationIssue };
export { validateTemplate };
