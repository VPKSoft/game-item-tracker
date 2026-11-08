import type { Template } from "../Schemas/TemplateSchema.ts";
import { createMessage, type LocalizedMessage, type MessageParams } from "../Types/LocalizedMessage.ts";

/** English templates of the validation messages. The UI translates them by key (`messages.<key>`). */
const validationMessages = {
    duplicateCategoryId: 'Duplicate category id "{{id}}"',
    duplicateItemId: 'Duplicate item id "{{id}}"',
    duplicateCounterKey: 'Duplicate counter key "{{key}}"',
    duplicateVariantKey: 'Duplicate variant key "{{key}}"',
    duplicateAttributeKey: 'Duplicate attribute key "{{key}}"',
    unknownParentCategory: 'Unknown parent category "{{parentId}}"',
    ownParentCategory: "A category cannot be its own parent",
    duplicateRole: 'Only one counter can have the role "{{role}}"',
    computedSumsNothing: 'Computed counter "{{counter}}" does not sum any counters',
    computedSumsUnknown: 'Computed counter "{{counter}}" sums unknown counter "{{key}}"',
    computedSumsComputed: 'Computed counter "{{counter}}" can only sum manual counters ("{{key}}" is computed)',
    computedHasMax: 'Computed counter "{{counter}}" cannot have a maximum',
    manualHasSum: 'Manual counter "{{counter}}" cannot have a sum',
    counterUnknownVariant: 'Counter "{{counter}}" refers to unknown variant "{{key}}"',
    attributeMinAboveMax: 'Attribute "{{attribute}}" has a minimum greater than its maximum',
    itemUnknownCategory: 'Item "{{item}}" refers to unknown category "{{categoryId}}"',
    itemMissingImage: 'Item "{{item}}" refers to a missing image',
    itemUnknownVariant: 'Item "{{item}}" refers to unknown variant "{{key}}"',
    itemUniqueUnknownVariant: 'Item "{{item}}" marks unknown variant "{{key}}" as unique',
    itemUniqueVariantMissing: 'Item "{{item}}" marks variant "{{key}}" as unique but does not have it',
    itemUnknownAttribute: 'Item "{{item}}" has unknown attribute "{{key}}"',
    itemAttributeOutOfRange: 'Item "{{item}}" has {{attribute}} {{value}}, outside {{min}}–{{max}}',
    itemDefaultUnknownCounter: 'Item "{{item}}" has a default for unknown manual counter "{{key}}"',
} as const;

/** The code of a validation message. */
type ValidationCode = keyof typeof validationMessages;

/** A single problem found in a template. */
type ValidationIssue = {
    /** Where the problem is, e.g. "counterDefs.total" or "items.bahari-bass". */
    path: string;
} & LocalizedMessage<ValidationCode>;

const issue = (path: string, code: ValidationCode, params?: MessageParams): ValidationIssue => ({
    path,
    ...createMessage(validationMessages, code, params),
});

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
        issues.push(issue(`categories.${id}`, "duplicateCategoryId", { id }));
    }
    for (const id of findDuplicates(template.items.map(i => i.id))) {
        issues.push(issue(`items.${id}`, "duplicateItemId", { id }));
    }
    for (const key of findDuplicates(template.counterDefs.map(c => c.key))) {
        issues.push(issue(`counterDefs.${key}`, "duplicateCounterKey", { key }));
    }
    for (const key of findDuplicates(template.variantDefs.map(v => v.key))) {
        issues.push(issue(`variantDefs.${key}`, "duplicateVariantKey", { key }));
    }
    for (const key of findDuplicates(template.attributeDefs.map(a => a.key))) {
        issues.push(issue(`attributeDefs.${key}`, "duplicateAttributeKey", { key }));
    }

    const categoryIds = new Set(template.categories.map(c => c.id));
    for (const category of template.categories) {
        if (category.parentId !== undefined) {
            if (!categoryIds.has(category.parentId)) {
                issues.push(
                    issue(`categories.${category.id}`, "unknownParentCategory", { parentId: category.parentId })
                );
            } else if (category.parentId === category.id) {
                issues.push(issue(`categories.${category.id}`, "ownParentCategory"));
            }
        }
    }

    const variantKeys = new Set(template.variantDefs.map(v => v.key));
    const manualKeys = new Set(template.counterDefs.filter(c => c.kind === "manual").map(c => c.key));
    const counterKeys = new Set(template.counterDefs.map(c => c.key));

    for (const role of ["owned", "target"] as const) {
        const withRole = template.counterDefs.filter(c => c.role === role);
        if (withRole.length > 1) {
            issues.push(issue(`counterDefs.${withRole[1].key}`, "duplicateRole", { role }));
        }
    }

    for (const counter of template.counterDefs) {
        const path = `counterDefs.${counter.key}`;
        if (counter.kind === "computed") {
            if (!counter.sumOf || counter.sumOf.length === 0) {
                issues.push(issue(path, "computedSumsNothing", { counter: counter.label }));
            }
            for (const key of counter.sumOf ?? []) {
                if (!counterKeys.has(key)) {
                    issues.push(issue(path, "computedSumsUnknown", { counter: counter.label, key }));
                } else if (!manualKeys.has(key)) {
                    issues.push(issue(path, "computedSumsComputed", { counter: counter.label, key }));
                }
            }
            if (counter.max !== undefined) {
                issues.push(issue(path, "computedHasMax", { counter: counter.label }));
            }
        } else if (counter.sumOf && counter.sumOf.length > 0) {
            issues.push(issue(path, "manualHasSum", { counter: counter.label }));
        }
        for (const key of counter.variants ?? []) {
            if (!variantKeys.has(key)) {
                issues.push(issue(path, "counterUnknownVariant", { counter: counter.label, key }));
            }
        }
    }

    for (const attribute of template.attributeDefs) {
        if (attribute.min > attribute.max) {
            issues.push(
                issue(`attributeDefs.${attribute.key}`, "attributeMinAboveMax", { attribute: attribute.label })
            );
        }
    }

    for (const item of template.items) {
        const path = `items.${item.id}`;
        if (!categoryIds.has(item.categoryId)) {
            issues.push(issue(path, "itemUnknownCategory", { item: item.name, categoryId: item.categoryId }));
        }
        if (item.imageId !== undefined && !(item.imageId in template.images)) {
            issues.push(issue(path, "itemMissingImage", { item: item.name }));
        }
        for (const key of item.variants ?? []) {
            if (!variantKeys.has(key)) {
                issues.push(issue(path, "itemUnknownVariant", { item: item.name, key }));
            }
        }
        if (Array.isArray(item.unique)) {
            for (const key of item.unique) {
                if (!variantKeys.has(key)) {
                    issues.push(issue(path, "itemUniqueUnknownVariant", { item: item.name, key }));
                } else if (item.variants && !item.variants.includes(key)) {
                    issues.push(issue(path, "itemUniqueVariantMissing", { item: item.name, key }));
                }
            }
        }
        for (const [key, value] of Object.entries(item.attributes)) {
            const def = template.attributeDefs.find(a => a.key === key);
            if (!def) {
                issues.push(issue(path, "itemUnknownAttribute", { item: item.name, key }));
            } else if (value < def.min || value > def.max) {
                issues.push(
                    issue(path, "itemAttributeOutOfRange", {
                        item: item.name,
                        attribute: def.label,
                        value,
                        min: def.min,
                        max: def.max,
                    })
                );
            }
        }
        for (const key of Object.keys(item.defaults ?? {})) {
            if (!manualKeys.has(key)) {
                issues.push(issue(path, "itemDefaultUnknownCounter", { item: item.name, key }));
            }
        }
    }

    return issues;
};

export type { ValidationCode, ValidationIssue };
export { validateTemplate, validationMessages };
