import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigProvider, theme } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaBadge } from "./PwaBadge.tsx";

const updateServiceWorker = vi.fn();
let needRefresh = true;
const setNeedRefresh = vi.fn((value: boolean) => {
    needRefresh = value;
});

vi.mock("virtual:pwa-register/react", () => ({
    useRegisterSW: () => ({
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, vi.fn()],
        updateServiceWorker,
    }),
}));

afterEach(() => {
    needRefresh = true;
    vi.clearAllMocks();
});

describe("PwaBadge", () => {
    it("reloads into the waiting service worker or closes the toast", () => {
        render(<PwaBadge />);
        expect(screen.getByText("New content available, click on reload button to update.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Reload" }));
        expect(updateServiceWorker).toHaveBeenCalledWith(true);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(setNeedRefresh).toHaveBeenCalledWith(false);
    });

    it("takes its colors from the theme, so the text stays readable in dark mode", () => {
        const colorsIn = (algorithm: typeof theme.darkAlgorithm) => {
            const { container, unmount } = render(
                <ConfigProvider theme={{ algorithm }}>
                    <PwaBadge />
                </ConfigProvider>
            );
            const toast = container.querySelector(".PWABadge-toast") as HTMLElement;
            const colors = { background: toast.style.background, color: toast.style.color };
            unmount();
            return colors;
        };
        const light = colorsIn(theme.defaultAlgorithm);
        const dark = colorsIn(theme.darkAlgorithm);
        expect(dark.background).not.toBe(light.background);
        expect(dark.color).not.toBe(light.color);
        expect(dark.background).not.toBe(dark.color);
    });

    it("is not shown when there is no update", () => {
        needRefresh = false;
        const { container } = render(<PwaBadge />);
        expect(container.querySelector(".PWABadge-toast")).toBeNull();
    });
});
