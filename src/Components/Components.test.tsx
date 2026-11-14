import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntdApp } from "antd";
import * as React from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getSaveItem, setCounterValue } from "../Domain/Counters.ts";
import { createSave } from "../Domain/CreateSave.ts";
import { fishTemplate } from "../Domain/TestFixtures.ts";
import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { CountersEditor } from "../Views/CountersEditor.tsx";
import { SaveItemDrawer } from "../Views/SaveItemDrawer.tsx";
import { UpgradeDialog } from "../Views/UpgradeDialog.tsx";
import { CounterStepper } from "./CounterStepper.tsx";
import { ItemBrowser } from "./ItemBrowser.tsx";
import { ItemCard } from "./ItemCard.tsx";

vi.mock("../Images/ImageResize.ts", async importOriginal => ({
    ...(await importOriginal<typeof import("../Images/ImageResize.ts")>()),
    resizeImage: vi.fn(async () => ({
        blob: new Blob(["x"], { type: "image/webp" }),
        dataUrl: "data:image/webp;base64,eA==",
        width: 64,
        height: 64,
        type: "image/webp",
    })),
    hashImage: vi.fn(async () => "hash123"),
}));

describe("CounterStepper", () => {
    it("steps by one, by ten with shift, and not below zero", async () => {
        const onChange = vi.fn();
        render(<CounterStepper label="Inventory" value={3} onChange={onChange} />);
        await userEvent.click(screen.getByLabelText("Increase Inventory"));
        expect(onChange).toHaveBeenLastCalledWith(4);
        fireEvent.click(screen.getByLabelText("Decrease Inventory"), { shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(0);
        fireEvent.click(screen.getByLabelText("Increase Inventory"), { shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(13);
    });

    it("respects the maximum", () => {
        const onChange = vi.fn();
        render(<CounterStepper label="Gift" value={9} max={10} onChange={onChange} />);
        fireEvent.click(screen.getByLabelText("Increase Gift"), { shiftKey: true });
        expect(onChange).toHaveBeenLastCalledWith(10);
    });

    it("is read-only without a change handler", () => {
        render(<CounterStepper label="Total" value={7} />);
        expect(screen.getByLabelText("Total")).toHaveTextContent("7");
        expect(screen.queryByLabelText("Increase Total")).toBeNull();
    });
});

/** A small save editor harness: the browser with cards wired to state. */
const SaveHarness = ({ template, initial }: { template: Template; initial: Save }) => {
    const [save, setSave] = React.useState(initial);
    const onCounterChange = React.useCallback(
        (itemId: string, variant: string, counter: string, value: number) =>
            setSave(s => ({
                ...s,
                items: {
                    ...s.items,
                    [itemId]: setCounterValue(template, getSaveItem(s, itemId), variant, counter, value),
                },
            })),
        [template]
    );
    return (
        <ItemBrowser
            template={template}
            save={save}
            renderCard={item => (
                <ItemCard
                    template={template}
                    item={item}
                    saveItem={save.items[item.id]}
                    onCounterChange={onCounterChange}
                    onOpen={() => undefined}
                    showCounters
                />
            )}
        />
    );
};

const visibleCards = () => screen.queryAllByTestId(/^item-card-/).map(e => e.getAttribute("data-testid")?.slice(10));

describe("ItemBrowser", () => {
    // jsdom has no layout; give elements a size so the virtualized grid renders rows.
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
        Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    });

    it("shows all items sorted by name and filters them with the quick search", async () => {
        const t = fishTemplate();
        render(<SaveHarness template={t} initial={createSave(t, "s")} />);
        expect(visibleCards()).toEqual(["eel", "koi", "bass"]);

        await userEvent.type(screen.getByLabelText("Search"), "worm");
        await waitFor(() => expect(visibleCards()).toEqual(["koi"]));
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("shows a counter row per variant and only the variant's counters", () => {
        const t = fishTemplate();
        render(<SaveHarness template={t} initial={createSave(t, "s")} />);
        const bass = within(screen.getByTestId("item-card-bass"));
        expect(bass.getByText("Normal")).toBeInTheDocument();
        expect(bass.getByText("Starred")).toBeInTheDocument();
        expect(bass.getAllByLabelText("Increase Placed")).toHaveLength(1);
        expect(bass.getAllByLabelText("Increase Inventory")).toHaveLength(2);
    });

    it("updates the computed total when a counter is stepped", async () => {
        const t = fishTemplate();
        render(<SaveHarness template={t} initial={createSave(t, "s")} />);
        const eel = within(screen.getByTestId("item-card-eel"));
        await userEvent.click(eel.getByLabelText("Increase Inventory"));
        await userEvent.click(eel.getByLabelText("Increase Inventory"));
        expect(eel.getByLabelText("Total")).toHaveTextContent("2");
    });

    it("shows an empty state when nothing matches", async () => {
        const t = fishTemplate();
        render(<SaveHarness template={t} initial={createSave(t, "s")} />);
        await userEvent.type(screen.getByLabelText("Search"), "zzzzzzzz");
        await waitFor(() => expect(screen.getByText("No items match")).toBeInTheDocument());
    });
});

describe("SaveItemDrawer", () => {
    it("commits notes on blur", async () => {
        const t = fishTemplate();
        const save = createSave(t, "s");
        let saveItem: SaveItem = save.items.koi;
        const onChange = vi.fn((_id: string, update: (s: SaveItem) => SaveItem) => {
            saveItem = update(saveItem);
        });
        render(
            <SaveItemDrawer
                template={t}
                item={t.items[1]}
                saveItem={saveItem}
                onClose={() => undefined}
                onChange={onChange}
                onCounterChange={() => undefined}
                onObtainedChange={() => undefined}
            />
        );
        const notes = await screen.findByLabelText("Notes");
        await userEvent.type(notes, "Found at night");
        expect(onChange).not.toHaveBeenCalled();
        act(() => {
            notes.blur();
        });
        expect(saveItem.notes).toBe("Found at night");
    });
});

describe("unique items", () => {
    it("shows an obtained checkbox instead of counters for a unique variant", async () => {
        const base = fishTemplate();
        const t = { ...base, items: base.items.map(i => (i.id === "koi" ? { ...i, unique: ["starred"] } : i)) };
        const onObtainedChange = vi.fn();
        render(
            <SaveItemDrawer
                template={t}
                item={t.items[1]}
                saveItem={createSave(t, "s").items.koi}
                onClose={() => undefined}
                onChange={() => undefined}
                onCounterChange={() => undefined}
                onObtainedChange={onObtainedChange}
            />
        );
        const checkbox = await screen.findByLabelText("Starred: obtained");
        expect(screen.queryByLabelText("Placed")).not.toBeInTheDocument();
        expect(screen.getAllByLabelText("Inventory")).toHaveLength(1);
        await userEvent.click(checkbox);
        expect(onObtainedChange).toHaveBeenCalledWith("koi", "starred", true);
    });
});

describe("ImagePreviewDialog via ImageDropZone", () => {
    it("resizes and stores the image only on Accept", async () => {
        const { ImageDropZone } = await import("./ImageDropZone.tsx");
        const { resizeImage } = await import("../Images/ImageResize.ts");
        const onAccept = vi.fn();
        render(<ImageDropZone onAccept={onAccept} onRemove={() => undefined} />);
        const file = new File(["png"], "fish.png", { type: "image/png" });
        await userEvent.upload(screen.getByTestId("image-file-input"), file);

        const preview = await screen.findByAltText("Preview");
        Object.defineProperty(preview, "naturalWidth", { value: 512 });
        Object.defineProperty(preview, "naturalHeight", { value: 256 });
        fireEvent.load(preview);
        expect(await screen.findByText(/128 × 64 px WebP/)).toBeInTheDocument();
        expect(resizeImage).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Accept" }));
        await waitFor(() => expect(onAccept).toHaveBeenCalledWith("hash123", "data:image/webp;base64,eA=="));
        expect(resizeImage).toHaveBeenCalledTimes(1);
    });

    it("discards the image on Cancel", async () => {
        const { ImageDropZone } = await import("./ImageDropZone.tsx");
        const onAccept = vi.fn();
        render(<ImageDropZone onAccept={onAccept} onRemove={() => undefined} />);
        await userEvent.upload(screen.getByTestId("image-file-input"), new File(["x"], "a.png", { type: "image/png" }));
        await screen.findByAltText("Preview");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onAccept).not.toHaveBeenCalled();
    });

    it("accepts a pasted image", async () => {
        const { ImageDropZone } = await import("./ImageDropZone.tsx");
        render(<ImageDropZone onAccept={() => undefined} onRemove={() => undefined} />);
        const file = new File(["x"], "pasted.png", { type: "image/png" });
        const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
        Object.defineProperty(event, "clipboardData", { value: { files: [file], items: [], types: ["Files"] } });
        act(() => {
            document.dispatchEvent(event);
        });
        expect(await screen.findByAltText("Preview")).toBeInTheDocument();
    });
});

describe("CountersEditor", () => {
    const Harness = ({ initial, onTemplate }: { initial: Template; onTemplate: (t: Template) => void }) => {
        const [template, setTemplate] = React.useState(initial);
        return (
            <CountersEditor
                template={template}
                onChange={t => {
                    setTemplate(t);
                    onTemplate(t);
                }}
            />
        );
    };

    it("starts empty and offers the common counters preset", async () => {
        const t: Template = { ...fishTemplate(), counterDefs: [] };
        let latest = t;
        render(<Harness initial={t} onTemplate={x => (latest = x)} />);
        expect(screen.getByText("This template has no counters")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add common counters" }));
        expect(latest.counterDefs.map(c => c.key)).toContain("total");
        expect(screen.getByText("Total = Inventory + Placed + Storage")).toBeInTheDocument();
    });

    it("adds a manual counter by label", async () => {
        const t: Template = { ...fishTemplate(), counterDefs: [] };
        let latest = t;
        render(<Harness initial={t} onTemplate={x => (latest = x)} />);
        await userEvent.type(screen.getByLabelText("New counter label"), "In chests{Enter}");
        expect(latest.counterDefs).toEqual([{ key: "in-chests", label: "In chests", kind: "manual", order: 0 }]);
    });
});

describe("UpgradeDialog", () => {
    const v1 = fishTemplate();
    const v2: Template = {
        ...v1,
        version: "1.1.0",
        counterDefs: v1.counterDefs.filter(c => c.key !== "tradeable"),
        items: v1.items.filter(i => i.id !== "koi"),
    };

    it("warns about removed counters and asks before discarding their values", async () => {
        const save = createSave(v1, "s");
        save.items.bass = setCounterValue(v1, save.items.bass, "normal", "tradeable", 5);
        const onUpgrade = vi.fn();
        render(
            <AntdApp>
                <UpgradeDialog
                    open
                    save={save}
                    oldTemplate={v1}
                    newTemplate={v2}
                    onCancel={vi.fn()}
                    onUpgrade={onUpgrade}
                />
            </AntdApp>
        );
        expect(screen.getByText("This version removes counters or variants")).toBeInTheDocument();
        expect(screen.getByText('Counter "Tradeable": 1 item has values')).toBeInTheDocument();
        expect(screen.getByText("The values are hidden but kept in the save.")).toBeInTheDocument();
        expect(screen.getByText(/Deleted from the template/)).toHaveTextContent("Ancient Koi");

        await userEvent.click(screen.getByText("Discard the hidden values of removed counters and variants"));
        expect(screen.getByText("The values will be deleted from the save.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Upgrade" }));
        expect(onUpgrade).not.toHaveBeenCalled();
        await screen.findAllByText("Delete the values of removed counters and variants?");
        const upgradeButtons = screen.getAllByRole("button", { name: "Upgrade" });
        expect(upgradeButtons).toHaveLength(2);
        await userEvent.click(upgradeButtons[1]);
        await waitFor(() => expect(onUpgrade).toHaveBeenCalledTimes(1));
        const [upgraded] = onUpgrade.mock.calls[0] as [Save];
        expect(upgraded.items.bass.counts.normal.tradeable).toBeUndefined();
        expect(upgraded.items.koi.orphan).toEqual({ name: "Ancient Koi", removedIn: "1.1.0" });
    });
});
