import { useVirtualizer } from "@tanstack/react-virtual";
import classNames from "classnames";
import * as React from "react";
import { styled } from "styled-components";
import type { BaseProps } from "../Types/BaseTypes.ts";

type Props<T> = {
    items: T[];
    getKey: (item: T) => string;
    renderItem: (item: T) => React.ReactNode;
    /** The minimum width of one cell; the number of columns follows the available width. */
    minCellWidth?: number;
    /** The estimated height of a row before it is measured. */
    estimatedRowHeight?: number;
    gap?: number;
} & BaseProps;

/** The size used before the scroll container has been measured (also used in tests). */
const initialRect = { width: 1200, height: 800 };

const useElementWidth = (ref: React.RefObject<HTMLDivElement | null>) => {
    const [width, setWidth] = React.useState(initialRect.width);
    React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        if (element.clientWidth > 0) {
            setWidth(element.clientWidth);
        }
        const observer = new ResizeObserver(entries => {
            const next = entries[0]?.contentRect.width;
            if (next && next > 0) {
                setWidth(next);
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return width;
};

/**
 * A vertically virtualized, responsive grid. Only the visible rows are rendered,
 * so tens of thousands of items scroll smoothly.
 */
const VirtualGridInner = <T,>({
    className,
    items,
    getKey,
    renderItem,
    minCellWidth = 280,
    estimatedRowHeight = 220,
    gap = 10,
}: Props<T>) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const width = useElementWidth(scrollRef);
    const columns = Math.max(1, Math.floor((width - gap + gap) / (minCellWidth + gap)));
    const rowCount = Math.ceil(items.length / columns);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => estimatedRowHeight,
        overscan: 4,
        initialRect,
    });

    // Re-measure when the column count changes, since row contents change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: columns is the trigger, not a value used inside
    React.useEffect(() => {
        virtualizer.measure();
    }, [columns, virtualizer]);

    return (
        <div ref={scrollRef} className={classNames(className, "VirtualGrid")} data-testid="virtual-grid">
            <div className="VirtualGrid-inner" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map(row => {
                    const rowItems = items.slice(row.index * columns, row.index * columns + columns);
                    return (
                        <div
                            key={row.key}
                            data-index={row.index}
                            ref={virtualizer.measureElement}
                            className="VirtualGrid-row"
                            style={{
                                transform: `translateY(${row.start}px)`,
                                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                gap,
                                paddingBottom: gap,
                            }}
                        >
                            {rowItems.map(item => (
                                <React.Fragment key={getKey(item)}>{renderItem(item)}</React.Fragment>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const VirtualGrid = styled(VirtualGridInner)`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    .VirtualGrid-inner {
        position: relative;
        width: 100%;
    }
    .VirtualGrid-row {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        display: grid;
        align-items: stretch;
        box-sizing: border-box;
    }
` as typeof VirtualGridInner;

export { VirtualGrid };
