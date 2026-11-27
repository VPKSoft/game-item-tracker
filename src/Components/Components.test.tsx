import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntdApp } from "antd";
import * as React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getSaveItem, setCounterValue } from "../Domain/Counters.ts";
import { createSave } from "../Domain/CreateSave.ts";
import type { ExchangeEntry } from "../Domain/Exchange.ts";
import { fishTemplate } from "../Domain/TestFixtures.ts";
import { serialize } from "../Files/FileFormat.ts";
import { defaultCatalogUrl } from "../Files/OnlineCatalog.ts";
import { renderExchangeImage } from "../Images/RenderExchangeImage.ts";
import { catalogFormat } from "../Schemas/CatalogSchema.ts";
import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getTemplate, putTemplate } from "../Storage/Database.ts";
import { CountersEditor } from "../Views/CountersEditor.tsx";
import { ExchangePanel } from "../Views/ExchangePanel.tsx";
import { MaterialsPanel } from "../Views/MaterialsPanel.tsx";
import { OnlineTemplatesDialog } from "../Views/OnlineTemplatesDialog.tsx";
import { SaveItemDrawer } from "../Views/SaveItemDrawer.tsx";
import { SetCounterDialog } from "../Views/SetCounterDialog.tsx";
import { TemplateEditor } from "../Views/TemplateEditor.tsx";
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

vi.mock("../Images/RenderExchangeImage.ts", async importOriginal => ({
    ...(await importOriginal<typeof import("../Images/RenderExchangeImage.ts")>()),
    renderExchangeImage: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
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

    it("is a checkbox when the maximum is 1", async () => {
        const onChange = vi.fn();
        const { rerender } = render(<CounterStepper label="Placed" value={0} max={1} onChange={onChange} />);
        expect(screen.queryByLabelText("Increase Placed")).toBeNull();
        const checkbox = screen.getByRole("checkbox", { name: "Placed" });
        expect(checkbox).not.toBeChecked();
        await userEvent.click(checkbox);
        expect(onChange).toHaveBeenLastCalledWith(1);
        rerender(<CounterStepper label="Placed" value={1} max={1} onChange={onChange} />);
        expect(screen.getByRole("checkbox", { name: "Placed" })).toBeChecked();
        await userEvent.click(screen.getByRole("checkbox", { name: "Placed" }));
        expect(onChange).toHaveBeenLastCalledWith(0);
    });

    it("is disabled with a reason, e.g. while a required counter is 0", async () => {
        const onChange = vi.fn();
        render(<CounterStepper label="To craft" value={0} onChange={onChange} disabledReason="Needs Acquired first" />);
        expect(screen.getByLabelText("Increase To craft")).toBeDisabled();
        expect(screen.getByLabelText("To craft")).toBeDisabled();
        render(
            <CounterStepper label="Done" value={0} max={1} onChange={onChange} disabledReason="Needs Acquired first" />
        );
        expect(screen.getByRole("checkbox", { name: "Done" })).toBeDisabled();
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

    it("opens on the template's default category until the user chooses another", async () => {
        const t: Template = { ...fishTemplate(), defaultCategoryId: "rivers" };
        const { unmount } = render(<SaveHarness template={t} initial={createSave(t, "s")} />);
        // Rivers includes its child category Upper rivers.
        expect(visibleCards()).toEqual(["eel", "koi"]);
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
        unmount();
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

    it("hides and unhides the item", async () => {
        const t = fishTemplate();
        let saveItem: SaveItem = createSave(t, "s").items.koi;
        const onChange = vi.fn((_id: string, update: (s: SaveItem) => SaveItem) => {
            saveItem = update(saveItem);
        });
        const drawer = (current: SaveItem) => (
            <SaveItemDrawer
                template={t}
                item={t.items[1]}
                saveItem={current}
                onClose={() => undefined}
                onChange={onChange}
                onCounterChange={() => undefined}
                onObtainedChange={() => undefined}
            />
        );
        const { rerender } = render(drawer(saveItem));
        await userEvent.click(await screen.findByRole("button", { name: /Hide/ }));
        expect(saveItem.hidden).toBe(true);
        rerender(drawer(saveItem));
        expect(screen.getByText(/This item is hidden/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Unhide/ }));
        expect(saveItem.hidden).toBeUndefined();
    });
});

describe("Hidden category", () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
        Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
    });
    afterAll(() => {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
        Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    });

    it("leaves hidden items out of the grid and lists them in the Hidden category", async () => {
        const t = fishTemplate();
        const save = createSave(t, "s");
        save.items.koi = { ...save.items.koi, hidden: true };
        render(<SaveHarness template={t} initial={save} />);
        expect(visibleCards()).toEqual(["eel", "bass"]);
        await userEvent.click(screen.getByLabelText("Category"));
        await userEvent.click(await screen.findByTitle("Hidden (1)"));
        expect(visibleCards()).toEqual(["koi"]);
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

describe("read-only counters", () => {
    it("shows the item's default without a stepper", async () => {
        const base = fishTemplate();
        const t: Template = {
            ...base,
            counterDefs: base.counterDefs.map(c => (c.key === "target" ? { ...c, readOnly: true } : c)),
            items: base.items.map(i => (i.id === "bass" ? { ...i, defaults: { target: 4 } } : i)),
        };
        render(
            <SaveItemDrawer
                template={t}
                item={t.items[0]}
                saveItem={createSave(t, "s").items.bass}
                onClose={() => undefined}
                onChange={() => undefined}
                onCounterChange={() => undefined}
                onObtainedChange={() => undefined}
            />
        );
        const targets = await screen.findAllByLabelText("Target");
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) {
            expect(target).toHaveTextContent("4");
        }
        expect(screen.queryByLabelText("Increase Target")).toBeNull();
        expect(screen.getAllByLabelText("Increase Inventory").length).toBeGreaterThan(0);
    });

    it("limits a maxFrom counter to the item's target, as a checkbox when it is 1", async () => {
        const base = fishTemplate();
        const t: Template = {
            ...base,
            counterDefs: base.counterDefs.map(c =>
                c.key === "target" ? { ...c, readOnly: true } : c.key === "inventory" ? { ...c, maxFrom: "target" } : c
            ),
            items: base.items.map(i => (i.id === "bass" ? { ...i, defaults: { target: 1 } } : i)),
        };
        render(
            <SaveItemDrawer
                template={t}
                item={t.items[0]}
                saveItem={createSave(t, "s").items.bass}
                onClose={() => undefined}
                onChange={() => undefined}
                onCounterChange={() => undefined}
                onObtainedChange={() => undefined}
            />
        );
        expect((await screen.findAllByRole("checkbox", { name: "Inventory" })).length).toBeGreaterThan(0);
        expect(screen.queryByLabelText("Increase Inventory")).toBeNull();
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

    it("makes a manual counter read-only", async () => {
        const t: Template = {
            ...fishTemplate(),
            counterDefs: [{ key: "need", label: "Need", kind: "manual", role: "target", order: 0 }],
        };
        let latest = t;
        render(<Harness initial={t} onTemplate={x => (latest = x)} />);
        await userEvent.click(screen.getByRole("checkbox", { name: "Read-only" }));
        expect(latest.counterDefs[0].readOnly).toBe(true);
        await userEvent.click(screen.getByRole("checkbox", { name: "Read-only" }));
        expect(latest.counterDefs[0].readOnly).toBeUndefined();
    });

    it("adds a counter profile and sets a counter's fixed value", async () => {
        const t = fishTemplate();
        let latest = t;
        render(<Harness initial={t} onTemplate={x => (latest = x)} />);
        await userEvent.type(screen.getByLabelText("New profile label"), "Single{Enter}");
        expect(latest.counterProfiles).toEqual([{ key: "single", label: "Single", overrides: {} }]);
        fireEvent.change(screen.getByLabelText("Fixed value of Target"), { target: { value: "1" } });
        await waitFor(() => expect(latest.counterProfiles?.[0].overrides).toEqual({ target: { value: 1 } }));
    });
});

describe("counter profiles in saves", () => {
    const base = fishTemplate();
    const t: Template = {
        ...base,
        counterProfiles: [
            {
                key: "single",
                label: "Single",
                overrides: { inventory: { max: 1 }, target: { use: "hidden", value: 1 } },
            },
            {
                key: "none",
                label: "None",
                overrides: Object.fromEntries(base.counterDefs.map(c => [c.key, { use: "off" as const }])),
            },
        ],
        items: base.items.map(i =>
            i.id === "koi" ? { ...i, counterProfile: "single" } : i.id === "bass" ? { ...i, counterProfile: "none" } : i
        ),
    };
    const drawer = (itemId: string) =>
        render(
            <SaveItemDrawer
                template={t}
                item={t.items.find(i => i.id === itemId) ?? t.items[0]}
                saveItem={createSave(t, "s").items[itemId]}
                onClose={() => undefined}
                onChange={() => undefined}
                onCounterChange={() => undefined}
                onObtainedChange={() => undefined}
            />
        );

    it("shows a single amount as a checkbox and hides the target", async () => {
        drawer("koi");
        expect(await screen.findAllByRole("checkbox", { name: "Inventory" })).toHaveLength(2);
        expect(screen.queryByLabelText("Target")).not.toBeInTheDocument();
        expect(screen.getAllByLabelText("Total")).toHaveLength(2);
    });

    it("shows no counters when the profile turns them all off", async () => {
        drawer("bass");
        expect(await screen.findByText("This item has no counters.")).toBeInTheDocument();
        expect(screen.queryByLabelText("Inventory")).not.toBeInTheDocument();
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

describe("OnlineTemplatesDialog", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("lists the online templates and installs an update", async () => {
        const template = { ...fishTemplate(), version: "1.1.0" };
        const listed = (name: string, templateId: string, version: string) => ({
            templateId,
            version,
            name,
            game: "Palia",
            itemCount: 3,
            updatedAt: template.updatedAt,
            path: `P/Palia/${templateId}.gitemplate.json`,
            size: 2048,
        });
        const catalog = {
            format: catalogFormat,
            schemaVersion: 1,
            generatedAt: template.updatedAt,
            templates: [listed("Fish", template.templateId, "1.1.0"), listed("Plushies", "plushies", "1.0.0")],
        };
        const files: Record<string, string> = {
            [defaultCatalogUrl]: JSON.stringify(catalog),
            [new URL(`P/Palia/${template.templateId}.gitemplate.json`, defaultCatalogUrl).toString()]:
                serialize(template),
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => new Response(files[url] ?? "", { status: files[url] ? 200 : 404 }))
        );
        const onInstalled = vi.fn();
        render(
            <AntdApp>
                <OnlineTemplatesDialog
                    open
                    stored={[
                        { templateId: template.templateId, version: "1.0.0" },
                        { templateId: "plushies", version: "1.0.0" },
                    ]}
                    onClose={vi.fn()}
                    onInstalled={onInstalled}
                />
            </AntdApp>
        );

        expect(await screen.findByText("Fish")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Share your own template" })).toHaveAttribute(
            "href",
            "https://github.com/VPKSoft/game-item-tracker-data/issues/new?template=submit-template.yml"
        );
        expect(screen.getByRole("button", { name: "Installed" })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Search games and templates"), "plush");
        expect(screen.queryByText("Fish")).toBeNull();
        await userEvent.clear(screen.getByLabelText("Search games and templates"));

        await userEvent.click(screen.getByRole("button", { name: "Update to v1.1.0" }));
        await waitFor(() => expect(onInstalled).toHaveBeenCalled());
        expect((await getTemplate(template.templateId, "1.1.0"))?.version).toBe("1.1.0");
    });

    it("shows a retry button when the list cannot be loaded", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("", { status: 500 }))
        );
        render(
            <AntdApp>
                <OnlineTemplatesDialog open stored={[]} onClose={vi.fn()} onInstalled={vi.fn()} />
            </AntdApp>
        );
        expect(await screen.findByText("The online template list could not be loaded (HTTP 500).")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
});

describe("TemplateEditor without an open template", () => {
    it("lists the stored templates to open", async () => {
        const template = { ...fishTemplate(), templateId: "picker-fish", name: "Picker Fish" };
        await putTemplate(template);
        const onOpenTemplate = vi.fn();
        render(
            <AntdApp>
                <TemplateEditor templateKey={null} onOpenTemplate={onOpenTemplate} onOpenLibrary={vi.fn()} />
            </AntdApp>
        );

        const row = (await screen.findByText("Picker Fish")).closest("tr") as HTMLElement;
        expect(screen.getByText("Choose a template to edit")).toBeInTheDocument();
        await userEvent.click(within(row).getByRole("button", { name: "Edit" }));
        expect(onOpenTemplate).toHaveBeenCalledWith({ templateId: "picker-fish", version: template.version });
    });
});

describe("exchange list", () => {
    const uniqueKoi = (): Template => {
        const base = fishTemplate();
        return { ...base, items: base.items.map(i => (i.id === "koi" ? { ...i, unique: ["starred"] } : i)) };
    };

    beforeAll(() => {
        URL.createObjectURL = vi.fn(() => "blob:preview");
        URL.revokeObjectURL = vi.fn();
    });

    it("shows Give and Need toggles per variant, without Give for a unique variant", async () => {
        const t = uniqueKoi();
        const onToggle = vi.fn();
        const entries: ExchangeEntry[] = [{ itemId: "koi", variantKey: "normal", mode: "give", amount: 3 }];
        render(
            <ItemCard
                template={t}
                item={t.items[1]}
                onOpen={() => undefined}
                showCounters
                exchangeEntries={entries}
                onExchangeToggle={onToggle}
            />
        );
        const give = screen.getByLabelText("Give Ancient Koi (Normal)");
        expect(give).toHaveTextContent("Give ×3");
        expect(give).toHaveAttribute("aria-pressed", "true");
        expect(screen.queryByLabelText("Give Ancient Koi (Starred)")).not.toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Need Ancient Koi (Starred)"));
        expect(onToggle).toHaveBeenCalledWith("koi", "starred", "need");
    });

    const PanelHarness = ({ template, save }: { template: Template; save: Save }) => {
        const [entries, setEntries] = React.useState<ExchangeEntry[]>([]);
        return (
            <AntdApp>
                <ExchangePanel
                    open
                    onClose={() => undefined}
                    template={template}
                    save={save}
                    entries={entries}
                    onChange={update => setEntries(update)}
                    getVisibleItems={() => template.items}
                />
            </AntdApp>
        );
    };

    it("fills missing items, edits the list and copies the image", async () => {
        const t = fishTemplate();
        const write = vi.fn(async () => undefined);
        class FakeClipboardItem {
            constructor(readonly items: Record<string, unknown>) {}
        }
        vi.stubGlobal("ClipboardItem", FakeClipboardItem);
        Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
        try {
            render(<PanelHarness template={t} save={createSave(t, "My fish")} />);
            expect(await screen.findByText(/Click Give or Need/)).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Add missing as Need" }));
            expect(await screen.findByText("2 entries added.")).toBeInTheDocument();
            expect(screen.getByText("Bass (Normal)")).toBeInTheDocument();
            expect(screen.getByText("Bass (Starred)")).toBeInTheDocument();
            expect(screen.getByText("Looking for (2)")).toBeInTheDocument();

            await userEvent.click(screen.getByLabelText("Remove Bass (Starred)"));
            expect(screen.queryByText("Bass (Starred)")).not.toBeInTheDocument();

            await waitFor(() => expect(screen.getByAltText("Preview")).toHaveAttribute("src", "blob:preview"));
            const input = vi.mocked(renderExchangeImage).mock.lastCall?.[0];
            expect(input?.title).toBe("My fish");
            expect(input?.tiles.need.map(x => [x.name, x.variantLabel, x.amount])).toEqual([["Bass", "Normal", 1]]);

            await userEvent.click(screen.getByRole("button", { name: "Copy image" }));
            await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
            expect(await screen.findByText(/The image was copied/)).toBeInTheDocument();
        } finally {
            vi.unstubAllGlobals();
            Reflect.deleteProperty(navigator, "clipboard");
        }
    });

    it("says when there is nothing to add", async () => {
        const t = fishTemplate();
        render(<PanelHarness template={t} save={createSave(t, "s")} />);
        // A side column next to the grid, not an overlay drawer that would hide cards.
        expect(screen.getByRole("complementary", { name: "Exchange list" })).toBeInTheDocument();
        expect(document.querySelector(".ant-drawer")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "Add as Give" }));
        expect(await screen.findByText("Nothing to add from the items shown.")).toBeInTheDocument();
    });
});

describe("MaterialsPanel", () => {
    /** The fish fixture with a planned counter and the materials Wood and Salt. */
    const craftTemplate = (): Template => {
        const base = fishTemplate();
        return {
            ...base,
            counterDefs: [
                ...base.counterDefs,
                { key: "to-make", label: "To make", kind: "manual", role: "planned", order: 5 },
            ],
            materials: [
                { id: "wood", name: "Wood", order: 0 },
                { id: "salt", name: "Salt", order: 1 },
            ],
            items: base.items.map(i => (i.id === "koi" ? { ...i, materials: { wood: 3, salt: 1 } } : i)),
        };
    };

    const Harness = ({ template, initial }: { template: Template; initial: Save }) => {
        const [save, setSave] = React.useState(initial);
        return (
            <AntdApp>
                <MaterialsPanel
                    open
                    onClose={() => undefined}
                    template={template}
                    save={save}
                    onGatheredChange={(id, value) => setSave(s => ({ ...s, gathered: { ...s.gathered, [id]: value } }))}
                    onClear={() => setSave(s => ({ ...s, gathered: undefined }))}
                />
            </AntdApp>
        );
    };

    it("lists the needed materials and marks a material once enough is gathered", async () => {
        const template = craftTemplate();
        const save = createSave(template, "s");
        save.items.koi = setCounterValue(template, save.items.koi, "normal", "to-make", 2);
        render(<Harness template={template} initial={save} />);
        const wood = screen.getByTestId("material-wood");
        expect(within(wood).getByText("Needed 6")).toBeTruthy();
        expect(within(wood).getByText("6 more")).toBeTruthy();
        expect(screen.getByText("0 of 2 materials gathered")).toBeTruthy();
        const salt = screen.getByTestId("material-salt");
        await userEvent.click(within(salt).getByLabelText("Increase Gathered"));
        await userEvent.click(within(salt).getByLabelText("Increase Gathered"));
        expect(within(salt).getByLabelText("Enough")).toBeTruthy();
        expect(screen.getByText("1 of 2 materials gathered")).toBeTruthy();
        await userEvent.click(screen.getByLabelText("Hide gathered"));
        expect(screen.queryByTestId("material-salt")).toBeNull();
        expect(screen.getByTestId("material-wood")).toBeTruthy();
    });

    it("shows the template's own title instead of the translated one", () => {
        const template = { ...craftTemplate(), materialsLabel: "Ingredients" };
        render(<Harness template={template} initial={createSave(template, "s")} />);
        expect(screen.getByRole("complementary", { name: "Ingredients" })).toBeTruthy();
        expect(screen.queryByText("Materials")).toBeNull();
    });

    it("explains how to plan when nothing is planned", () => {
        const template = craftTemplate();
        render(<Harness template={template} initial={createSave(template, "s")} />);
        expect(
            screen.getByText(
                "Nothing is planned yet. Set the To make counter of items to list the materials they need."
            )
        ).toBeTruthy();
    });
});

describe("selection and Set counter", () => {
    it("selects a card on click instead of opening it", async () => {
        const t = fishTemplate();
        const onOpen = vi.fn();
        const onSelect = vi.fn();
        const { rerender } = render(
            <ItemCard
                template={t}
                item={t.items[0]}
                onOpen={onOpen}
                showCounters
                selected={false}
                onSelect={onSelect}
            />
        );
        const checkbox = screen.getByLabelText("Select Bass");
        expect(checkbox).not.toBeChecked();
        await userEvent.click(screen.getByTestId("item-card-bass"));
        expect(onSelect).toHaveBeenCalledWith("bass", false);
        await userEvent.click(checkbox);
        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onOpen).not.toHaveBeenCalled();
        rerender(<ItemCard template={t} item={t.items[0]} onOpen={onOpen} showCounters selected onSelect={onSelect} />);
        expect(screen.getByLabelText("Select Bass")).toBeChecked();
    });

    it("previews and applies a counter value for the selected items", async () => {
        const t = fishTemplate();
        const onApply = vi.fn();
        render(
            <AntdApp>
                <SetCounterDialog
                    open
                    template={t}
                    save={createSave(t, "S")}
                    itemIds={new Set(["bass", "eel"])}
                    onCancel={() => undefined}
                    onApply={onApply}
                />
            </AntdApp>
        );
        expect(await screen.findByText("Sets Inventory to 0 for 2 items.")).toBeInTheDocument();
        const value = screen.getByLabelText("Value");
        await userEvent.clear(value);
        await userEvent.type(value, "4");
        expect(await screen.findByText("Sets Inventory to 4 for 2 items.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Set" }));
        expect(onApply).toHaveBeenCalledWith({ counterKey: "inventory", variantKey: undefined, value: 4 });
    });

    it("shows a checkbox for a counter with a maximum of 1", async () => {
        const t = fishTemplate();
        t.counterDefs = [{ key: "obtained", label: "Obtained", kind: "manual", max: 1, order: 0 }];
        const onApply = vi.fn();
        render(
            <AntdApp>
                <SetCounterDialog
                    open
                    template={t}
                    save={createSave(t, "S")}
                    itemIds={new Set(["bass", "eel"])}
                    onCancel={() => undefined}
                    onApply={onApply}
                />
            </AntdApp>
        );
        expect(await screen.findByText("Sets Obtained to unchecked for 2 items.")).toBeInTheDocument();
        expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("checkbox", { name: "Obtained" }));
        expect(await screen.findByText("Sets Obtained to checked for 2 items.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Set" }));
        expect(onApply).toHaveBeenCalledWith({ counterKey: "obtained", variantKey: undefined, value: 1 });
    });

    it("follows the counter profile maximums of the selected items", async () => {
        const base = fishTemplate();
        const t: Template = {
            ...base,
            counterDefs: [
                { key: "obtained", label: "Obtained", kind: "manual", max: 1, order: 0 },
                { key: "amount", label: "Amount", kind: "manual", order: 1 },
            ],
            counterProfiles: [
                { key: "more", label: "More", overrides: { obtained: { max: 3 }, amount: { max: 1 } } },
                { key: "single", label: "Single", overrides: { amount: { max: 1 } } },
            ],
            items: base.items.map(i =>
                i.id === "bass" ? { ...i, counterProfile: "more" } : { ...i, counterProfile: "single" }
            ),
        };
        const onApply = vi.fn();
        render(
            <AntdApp>
                <SetCounterDialog
                    open
                    template={t}
                    save={createSave(t, "S")}
                    itemIds={new Set(["bass", "eel"])}
                    onCancel={() => undefined}
                    onApply={onApply}
                />
            </AntdApp>
        );
        // Obtained has max 1, but Bass's profile allows 3: a number field up to 3.
        const value = await screen.findByLabelText("Value");
        await userEvent.clear(value);
        await userEvent.type(value, "3");
        expect(await screen.findByText("Sets Obtained to 3 for 2 items.")).toBeInTheDocument();
        // Amount has no limit, but both profiles give it max 1: a checkbox, with the 3 kept from Obtained capped to 1.
        await userEvent.click(screen.getByLabelText("Counter"));
        await userEvent.click(await screen.findByTitle("Amount"));
        expect(await screen.findByRole("checkbox", { name: "Amount" })).toBeChecked();
        expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();
    });

    it("reports items that do not use the chosen counter", async () => {
        const t = fishTemplate();
        render(
            <AntdApp>
                <SetCounterDialog
                    open
                    template={t}
                    save={createSave(t, "S")}
                    itemIds={new Set(["bass", "eel"])}
                    onCancel={() => undefined}
                    onApply={() => undefined}
                />
            </AntdApp>
        );
        await userEvent.click(await screen.findByLabelText("Counter"));
        await userEvent.click(await screen.findByTitle("Placed"));
        expect(await screen.findByText("Sets Placed to 0 for 1 item.")).toBeInTheDocument();
        expect(screen.getByText(/1 selected item is skipped/)).toBeInTheDocument();
    });
});
