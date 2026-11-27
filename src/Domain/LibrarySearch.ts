import type { SaveSummary, TemplateSummary } from "../Storage/Database.ts";

/** Whether every whitespace-separated word of the query appears in one of the texts, ignoring case. */
const matchesWords = (query: string, ...texts: (string | undefined)[]) => {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const text = texts.filter(Boolean).join(" ").toLocaleLowerCase();
    return words.every(word => text.includes(word));
};

/** The saves whose name or template name, game and version match every word of the query, in their order. */
const filterSaves = (saves: readonly SaveSummary[], query: string) =>
    saves.filter(s => matchesWords(query, s.name, s.template.name, s.template.game, s.template.version));

/** The templates whose name, game or version match every word of the query, in their order. */
const filterTemplates = (templates: readonly TemplateSummary[], query: string) =>
    templates.filter(row => matchesWords(query, row.name, row.game, row.version));

export { filterSaves, filterTemplates };
