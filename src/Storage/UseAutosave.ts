import * as React from "react";

/**
 * Saves a value after it has stopped changing for `delay` milliseconds.
 * Pending changes are flushed when the page is hidden or closed and when the component unmounts.
 * @param value The value to save; a new reference counts as a change. `null` disables saving.
 * @param save The function that persists the value.
 * @param delay The debounce delay in milliseconds.
 * @returns A function that flushes pending changes immediately.
 */
const useAutosave = <T>(value: T | null, save: (value: T) => Promise<void> | void, delay = 500) => {
    const pending = React.useRef<T | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveRef = React.useRef(save);
    const firstValue = React.useRef(true);
    saveRef.current = save;

    const flush = React.useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        if (pending.current !== null) {
            const toSave = pending.current;
            pending.current = null;
            void saveRef.current(toSave);
        }
    }, []);

    React.useEffect(() => {
        // The initial value was just loaded, so it does not need saving.
        if (firstValue.current) {
            firstValue.current = false;
            return;
        }
        if (value === null) {
            return;
        }
        pending.current = value;
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(flush, delay);
    }, [value, delay, flush]);

    React.useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                flush();
            }
        };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", onVisibility);
            flush();
        };
    }, [flush]);

    return flush;
};

export { useAutosave };
