import {
    faArrowDownWideShort,
    faArrowUpShortWide,
    faFilter,
    faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Button, Checkbox, Empty, Input, Popover, Select, Tooltip } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { type BrowseFilters, browseItems, getCategoryWithChildren, getSortOptions } from "../Domain/Browse.ts";
import { searchItems } from "../Domain/Search.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";
import { useSearchIndex } from "./UseSearchIndex.ts";
import { VirtualGrid } from "./VirtualGrid.tsx";

type Props = {
    template: Template;
    /** The save; when given, counter sorts and filters are available. */
    save?: Save;
    renderCard: (item: TemplateItem) => React.ReactNode;
    /** Extra controls shown at the end of the toolbar. */
    toolbarExtra?: React.ReactNode;
    /** A localStorage key under which the category and sort selection are remembered. */
    stateKey?: string;
    /** Called with the items the grid shows (after category, search and filters) whenever they change. */
    onItemsChange?: (items: TemplateItem[]) => void;
} & BaseProps;

type BrowserState = {
    categoryId: string | null;
    sort: string;
    direction: "asc" | "desc";
    filters: BrowseFilters;
};

const defaultState: BrowserState = { categoryId: null, sort: "name", direction: "asc", filters: {} };

const loadState = (key: string | undefined): BrowserState => {
    if (!key) {
        return defaultState;
    }
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
    } catch {
        return defaultState;
    }
};

const useDebounced = <T,>(value: T, delay: number) => {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

const countActiveFilters = (filters: BrowseFilters) =>
    (filters.missingOnly ? 1 : 0) +
    (filters.withNotes ? 1 : 0) +
    (filters.counterAboveZero ? 1 : 0) +
    (filters.tags && filters.tags.length > 0 ? 1 : 0);

/**
 * The shared item view of both editors: category selection, quick search,
 * sorting, filters and a virtualized, scrollable card grid.
 */
let ItemBrowser = ({ className, template, save, renderCard, toolbarExtra, stateKey, onItemsChange }: Props) => {
    const [state, setState] = React.useState<BrowserState>(() => loadState(stateKey));
    const [query, setQuery] = React.useState("");
    const debouncedQuery = useDebounced(query, 150);
    const index = useSearchIndex(template, save);
    const { t } = useTranslation();

    React.useEffect(() => {
        if (stateKey) {
            try {
                localStorage.setItem(stateKey, JSON.stringify(state));
            } catch {
                // Storage can be unavailable; the selection is just not remembered.
            }
        }
    }, [state, stateKey]);

    const searchRanks = React.useMemo(() => searchItems(index, debouncedQuery), [index, debouncedQuery]);
    const hasSearch = searchRanks !== null;

    const sortOptions = React.useMemo(() => {
        // The fixed sorts are translated here; attribute and counter sorts use the template's own labels.
        const fixedLabels: Record<string, string> = {
            relevance: t("browser.sortRelevance"),
            name: t("browser.sortName"),
            missing: t("browser.sortMissing"),
        };
        return getSortOptions(template, !!save, hasSearch).map(o => ({ ...o, label: fixedLabels[o.value] ?? o.label }));
    }, [template, save, hasSearch, t]);

    // Fall back to a valid sort when the current one is unavailable (e.g. search cleared, counter removed).
    let sort = state.sort;
    if (!sortOptions.some(o => o.value === sort)) {
        sort = "name";
    }
    // Searching sorts by relevance until the user picks something else.
    const [sortTouchedDuringSearch, setSortTouchedDuringSearch] = React.useState(false);
    React.useEffect(() => {
        if (!hasSearch) {
            setSortTouchedDuringSearch(false);
        }
    }, [hasSearch]);
    const effectiveSort = hasSearch && !sortTouchedDuringSearch ? "relevance" : sort;

    const categoryId =
        state.categoryId && template.categories.some(c => c.id === state.categoryId) ? state.categoryId : null;

    const items = React.useMemo(
        () =>
            browseItems(template, save, {
                categoryId,
                searchRanks,
                sort: effectiveSort,
                direction: state.direction,
                filters: save ? state.filters : undefined,
            }),
        [template, save, categoryId, searchRanks, effectiveSort, state.direction, state.filters]
    );

    React.useEffect(() => {
        onItemsChange?.(items);
    }, [items, onItemsChange]);

    const categoryOptions = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of template.items) {
            counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
        }
        const sorted = [...template.categories].sort((a, b) => a.order - b.order);
        const result: { value: string; label: string }[] = [
            { value: "", label: t("browser.allCategories", { count: template.items.length }) },
        ];
        const addLevel = (parentId: string | undefined, depth: number) => {
            for (const category of sorted.filter(c => c.parentId === parentId)) {
                let count = 0;
                for (const id of getCategoryWithChildren(template, category.id)) {
                    count += counts.get(id) ?? 0;
                }
                result.push({ value: category.id, label: `${" ".repeat(depth)}${category.name} (${count})` });
                addLevel(category.id, depth + 1);
            }
        };
        addLevel(undefined, 0);
        // Categories whose parent is missing would otherwise be hidden.
        for (const category of sorted) {
            if (!result.some(r => r.value === category.id)) {
                result.push({ value: category.id, label: category.name });
            }
        }
        return result;
    }, [template, t]);

    const setFilters = (patch: Partial<BrowseFilters>) =>
        setState(s => ({ ...s, filters: { ...s.filters, ...patch } }));

    const filterContent = save ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 260 }}>
            {sortOptions.some(o => o.value === "missing") && (
                <Checkbox
                    checked={!!state.filters.missingOnly}
                    onChange={e => setFilters({ missingOnly: e.target.checked })}
                >
                    {t("browser.onlyMissing")}
                </Checkbox>
            )}
            <Checkbox checked={!!state.filters.withNotes} onChange={e => setFilters({ withNotes: e.target.checked })}>
                {t("browser.onlyWithNotes")}
            </Checkbox>
            <Select
                allowClear
                placeholder={t("browser.counterAboveZero")}
                value={state.filters.counterAboveZero}
                onChange={value => setFilters({ counterAboveZero: value })}
                options={template.counterDefs.map(c => ({ value: c.key, label: `${c.label} > 0` }))}
            />
            <Select
                mode="multiple"
                allowClear
                placeholder={t("browser.hasTags")}
                value={state.filters.tags ?? []}
                onChange={value => setFilters({ tags: value })}
                options={template.tags.map(t => ({ value: t, label: t }))}
                maxTagCount="responsive"
            />
            <Button size="small" onClick={() => setState(s => ({ ...s, filters: {} }))}>
                {t("browser.clearFilters")}
            </Button>
        </div>
    ) : null;

    return (
        <div className={classNames(className, "ItemBrowser")}>
            <div className="ItemBrowser-toolbar">
                <Select
                    className="ItemBrowser-category"
                    value={categoryId ?? ""}
                    onChange={value => setState(s => ({ ...s, categoryId: value === "" ? null : value }))}
                    options={categoryOptions}
                    aria-label={t("common.category")}
                    popupMatchSelectWidth={false}
                />
                <Input
                    className="ItemBrowser-search"
                    allowClear
                    prefix={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    placeholder={t("browser.searchPlaceholder")}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    aria-label={t("browser.search")}
                />
                <Select
                    className="ItemBrowser-sort"
                    value={effectiveSort}
                    onChange={value => {
                        if (hasSearch) {
                            setSortTouchedDuringSearch(true);
                        }
                        setState(s => ({ ...s, sort: value === "relevance" ? s.sort : value }));
                        if (value === "relevance") {
                            setSortTouchedDuringSearch(false);
                        }
                    }}
                    options={sortOptions}
                    aria-label={t("browser.sortBy")}
                    popupMatchSelectWidth={false}
                />
                <Tooltip title={state.direction === "asc" ? t("browser.ascending") : t("browser.descending")}>
                    <Button
                        aria-label={t("browser.sortDirection")}
                        disabled={effectiveSort === "relevance"}
                        icon={
                            <FontAwesomeIcon
                                icon={state.direction === "asc" ? faArrowUpShortWide : faArrowDownWideShort}
                            />
                        }
                        onClick={() => setState(s => ({ ...s, direction: s.direction === "asc" ? "desc" : "asc" }))}
                    />
                </Tooltip>
                {filterContent && (
                    <Popover content={filterContent} trigger="click" placement="bottomRight">
                        <Badge count={countActiveFilters(state.filters)} size="small">
                            <Button icon={<FontAwesomeIcon icon={faFilter} />} aria-label={t("browser.filters")} />
                        </Badge>
                    </Popover>
                )}
                <span className="ItemBrowser-count">
                    {items.length} / {template.items.length}
                </span>
                {toolbarExtra}
            </div>
            {items.length === 0 ? (
                <Empty
                    className="ItemBrowser-empty"
                    description={template.items.length === 0 ? t("browser.noItemsYet") : t("browser.noItemsMatch")}
                />
            ) : (
                <VirtualGrid items={items} getKey={item => item.id} renderItem={renderCard} />
            )}
        </div>
    );
};

ItemBrowser = styled(ItemBrowser)`
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    min-width: 0;
    flex: 1;
    .ItemBrowser-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
    }
    .ItemBrowser-category {
        min-width: 180px;
    }
    .ItemBrowser-search {
        flex: 1;
        min-width: 200px;
    }
    .ItemBrowser-sort {
        min-width: 150px;
    }
    .ItemBrowser-count {
        opacity: 0.7;
        font-size: 0.85em;
        white-space: nowrap;
    }
    .ItemBrowser-empty {
        margin-top: 40px;
    }
`;

export { ItemBrowser };
