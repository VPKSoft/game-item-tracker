/**
 * Retakes the screenshots of docs/USER_MANUAL.md (docs/images/manual).
 *
 *     npm run screenshots
 *     npm run screenshots -- --out <dir> --chrome <path to chrome> --port 9333 --image public/app-icon.png
 *
 * Starts the Vite dev server, launches headless Chrome with a throwaway profile and drives the app through the
 * Chrome DevTools protocol: it installs the Palia templates from the online catalog (`VITE_CATALOG_URL` or the
 * published one), fills a save with sample amounts and a note, and captures every view the manual shows at
 * 1400 × 860 (dialogs, cards and the save drawer are cropped to the element). Needs a network connection and
 * Chrome or Edge. Set `CHROME_PATH` or pass `--chrome` when the browser is not found.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
    options: {
        out: { type: "string", default: resolve("docs", "images", "manual") },
        chrome: { type: "string", default: process.env.CHROME_PATH },
        port: { type: "string", default: "9333" },
        image: { type: "string", default: resolve("public", "app-icon.png") },
    },
});

const width = 1400;
const height = 860;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const chromeCandidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
];

const findChrome = () => {
    const path = values.chrome ?? chromeCandidates.find(c => existsSync(c));
    if (!path) {
        throw new Error("Chrome was not found. Pass --chrome <path> or set CHROME_PATH.");
    }
    return path;
};

/** A minimal Chrome DevTools protocol client for one page. */
class Page {
    private nextId = 1;
    private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

    private constructor(private readonly socket: WebSocket) {
        socket.onmessage = event => {
            const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
            const waiter = msg.id === undefined ? undefined : this.pending.get(msg.id);
            if (msg.id !== undefined && waiter) {
                this.pending.delete(msg.id);
                if (msg.error) {
                    waiter.reject(new Error(JSON.stringify(msg.error)));
                } else {
                    waiter.resolve(msg.result);
                }
            }
        };
    }

    static async open(port: string) {
        const target = (await (
            await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
        ).json()) as {
            webSocketDebuggerUrl: string;
        };
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            socket.onopen = res;
            socket.onerror = rej;
        });
        return new Page(socket);
    }

    send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
        return new Promise<T>((res, rej) => {
            const id = this.nextId++;
            this.pending.set(id, { resolve: v => res(v as T), reject: rej });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    /** Evaluates a JavaScript expression in the page and returns its JSON value. */
    async evaluate<T = unknown>(expression: string) {
        const r = await this.send<{
            result: { value: T };
            exceptionDetails?: { text: string; exception?: { description?: string } };
        }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        }
        return r.result.value;
    }

    close() {
        this.socket.close();
    }
}

// Page-side expressions that find elements.
const visible = "e => e.getClientRects().length > 0";
const byText = (text: string, scope = "document", index = 0) => `(() => {
    const all = [...(${scope}).querySelectorAll("*")].filter(e => e.getClientRects().length > 0 &&
        e.textContent.trim() === ${JSON.stringify(text)} &&
        ![...e.children].some(c => c.textContent.trim() === ${JSON.stringify(text)}));
    return all[${index}];
})()`;
const modal = `[...document.querySelectorAll(".ant-modal")].filter(${visible}).at(-1)`;
const modalBox = `${modal}.querySelector(".ant-modal-container, .ant-modal-content")`;
const drawer = `[...document.querySelectorAll(".ant-drawer-content-wrapper")].filter(${visible}).at(-1)`;
const openDropdown = `document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")`;
const searchInput = `document.querySelector('input[aria-label="Search"]')`;
const selectWith = (label: string) =>
    `[...document.querySelectorAll(".ant-select")].find(e => e.querySelector('[aria-label="${label}"]'))`;
const card = (name: string) =>
    `[...document.querySelectorAll(".ItemCard")].find(c => c.querySelector(".ItemCard-name")?.textContent.trim() === ${JSON.stringify(name)})`;

type Rect = { x: number; y: number; width: number; height: number };

/** Drives the app in one page: clicks, typing, waiting and screenshots. */
const createDriver = (page: Page, outDir: string) => {
    const waitFor = async (expression: string, label: string, timeout = 20000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (
                await page.evaluate<boolean>(`(() => { try { return !!(${expression}); } catch { return false; } })()`)
            ) {
                return;
            }
            await sleep(150);
        }
        throw new Error(`Timed out waiting for ${label}`);
    };
    const rectOf = async (expression: string) => {
        const r = await page.evaluate<Rect | null>(
            `(() => { const e = ${expression}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`
        );
        if (!r) {
            throw new Error(`Element not found: ${expression.slice(0, 120)}`);
        }
        return r;
    };
    /** A real mouse click at the element's center, so antd selects, switches and cards react as for a user. */
    const click = async (expression: string) => {
        const r = await rectOf(expression);
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
        await sleep(250);
    };
    const key = async (name: string, keyCode: number) => {
        await page.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: name,
            code: name,
            windowsVirtualKeyCode: keyCode,
        });
        await page.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: name,
            code: name,
            windowsVirtualKeyCode: keyCode,
        });
        await sleep(300);
    };
    const selectAll = (expression: string) => page.evaluate(`(() => { (${expression}).select?.(); return true; })()`);
    const typeInto = async (expression: string, text: string) => {
        await click(expression);
        await selectAll(expression);
        await page.send("Input.insertText", { text });
        await sleep(300);
    };
    const clearInput = async (expression: string) => {
        await click(expression);
        await selectAll(expression);
        await key("Backspace", 8);
    };
    const shot = async (name: string, clipExpression?: string) => {
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: width - 1, y: height - 1 });
        await sleep(400);
        const params: Record<string, unknown> = { format: "png" };
        if (clipExpression) {
            const r = await rectOf(clipExpression);
            params.clip = {
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
                scale: 1,
            };
        }
        const { data } = await page.send<{ data: string }>("Page.captureScreenshot", params);
        await writeFile(join(outDir, name), Buffer.from(data, "base64"));
        console.log(`saved ${name}`);
    };
    return {
        waitFor,
        click,
        clickText: (text: string, scope?: string, index?: number) => click(byText(text, scope, index)),
        escape: () => key("Escape", 27),
        typeInto,
        clearInput,
        shot,
        view: async (name: string) => {
            await click(
                `[...document.querySelectorAll(".ant-segmented-item")].find(e => e.textContent.trim() === ${JSON.stringify(name)})`
            );
            await sleep(700);
        },
        tab: async (name: string, file?: string) => {
            await click(
                `[...document.querySelectorAll(".ant-tabs-tab")].find(e => e.textContent.trim() === ${JSON.stringify(name)})`
            );
            await sleep(900);
            if (file) {
                await shot(file);
            }
        },
        messagesGone: () => waitFor(`!document.querySelector(".ant-message-notice")`, "messages to disappear"),
    };
};

/** The amounts (Normal inventory, target) of the sample save, as in the manual's text. */
const sampleAmounts: Record<string, [number, number]> = {
    "Albino Eel": [2, 1],
    "Alligator Gar": [1, 2],
    "Amber Moray": [2, 1],
    "Ancient Cloudminnow": [1, 2],
    "Ancient Fish": [2, 1],
    "Ancient Koi": [1, 2],
};
const sampleNote = "Caught during rain at the Kilima lake. Placed one in the aquarium.";

const capture = async (page: Page, appUrl: string, outDir: string, imageFile: string) => {
    const d = createDriver(page, outDir);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("DOM.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: appUrl });
    await d.waitFor(`document.readyState === "complete" && document.querySelector(".ant-segmented")`, "the app");
    // Start from an empty library (the profile is new, but be safe).
    await page.evaluate(`(async () => {
        localStorage.clear();
        const { closeDatabase } = await import("/src/Storage/Database.ts");
        await closeDatabase();
        await new Promise(r => { const q = indexedDB.deleteDatabase("game-item-tracker"); q.onsuccess = q.onerror = q.onblocked = r; });
        return true;
    })()`);
    await page.send("Page.reload");
    await sleep(500);
    await d.waitFor(`document.readyState === "complete" && document.querySelector(".ant-segmented")`, "the app");
    await sleep(500);

    // Library and online templates.
    await d.view("Library");
    await d.waitFor(`document.body.innerText.includes("Online templates…")`, "the library");
    await d.shot("01-library-empty.png");
    await d.clickText("Online templates…");
    await d.waitFor(`${modal}.innerText.includes("Palia – Plushies")`, "the online catalog");
    await sleep(600);
    await d.shot("29-online-templates.png");
    await d.clickText("Install", modal, 0);
    await d.waitFor(`${modal}.innerText.includes("Installed")`, "the first install");
    await d.clickText("Install", modal, 0);
    await d.waitFor(
        `[...${modal}.querySelectorAll("button")].filter(b => b.textContent.trim() === "Installed").length === 2`,
        "the second install"
    );
    await d.clickText("Close", modal);
    await d.waitFor(`!${modal}`, "the dialog to close");
    await sleep(500);
    await d.shot("02-library-templates.png");
    await d.messagesGone();

    // New save.
    await d.clickText("New save", "document", 0);
    await d.waitFor(modal, "the new save dialog");
    await sleep(500);
    await d.typeInto(`${modal}.querySelector("input")`, "My Palia Fish");
    await d.shot("03-new-save-dialog.png", modalBox);
    await d.clickText("Create", modal);
    await d.waitFor(`document.querySelector(".ItemCard")`, "the inventory");
    await sleep(800);

    // Sample amounts and a note, written while no editor has the save open.
    await d.view("Library");
    await d.waitFor(`document.body.innerText.includes("My Palia Fish")`, "the library");
    await page.evaluate(`(async () => {
        const db = await import("/src/Storage/Database.ts");
        const [summary] = await db.listSaves();
        const save = await db.getSave(summary.saveId);
        const template = await db.getTemplate(save.template.templateId, save.template.version);
        const id = name => template.items.find(i => i.name === name).id;
        const items = { ...save.items };
        for (const [name, [inventory, target]] of Object.entries(${JSON.stringify(sampleAmounts)})) {
            const item = items[id(name)];
            items[id(name)] = { ...item, counts: { ...item.counts, normal: { ...item.counts.normal, inventory, target } } };
        }
        const minnow = id("Ancient Cloudminnow");
        items[minnow] = { ...items[minnow], notes: ${JSON.stringify(sampleNote)} };
        await db.putSave({ ...save, items, updatedAt: new Date().toISOString() });
        return true;
    })()`);
    await sleep(300);
    await d.clickText("Open", "document", 0);
    await d.waitFor(card("Ancient Cloudminnow"), "the inventory with data");
    await sleep(1000);

    // Inventory.
    await d.shot("04-inventory.png");
    await d.shot("05-item-card.png", card("Albino Eel"));
    await d.shot("06-unique-card-before.png", card("Ancient Cloudminnow"));
    await d.click(`${card("Ancient Cloudminnow")}.querySelector(".CounterRows-obtained input[type=checkbox]")`);
    await sleep(500);
    await d.shot("07-unique-card-obtained.png", card("Ancient Cloudminnow"));
    await d.click(`${card("Ancient Cloudminnow")}.querySelector(".ItemCard-name")`);
    await d.waitFor(drawer, "the save item drawer");
    await sleep(800);
    await d.shot("08-save-item-drawer.png", drawer);
    await d.escape();
    await d.waitFor(`!${drawer}`, "the drawer to close");

    await d.typeInto(searchInput, "bass");
    await sleep(800);
    await d.shot("09-search.png");
    await d.clearInput(searchInput);
    await sleep(800);
    // Searching switched the sort to Relevance; set it back to Name.
    await d.click(selectWith("Sort by"));
    await d.waitFor(openDropdown, "the sort menu");
    await d.clickText("Name", openDropdown);
    await sleep(600);

    await d.click(selectWith("Category"));
    await d.waitFor(openDropdown, "the category menu");
    await sleep(500);
    await d.shot("10-category-select.png");
    await d.escape();
    await d.click(selectWith("Sort by"));
    await d.waitFor(openDropdown, "the sort menu");
    await sleep(500);
    await d.shot("11-sort-menu.png");
    await d.escape();
    await sleep(300);
    await d.click(`document.querySelector('button[aria-label="Filters"]')`);
    await d.waitFor(`[...document.querySelectorAll(".ant-popover")].filter(${visible}).length`, "the filters");
    await sleep(500);
    await d.shot("12-filters.png");
    await d.click(`document.querySelector('button[aria-label="Filters"]')`);
    await sleep(500);
    await d.click(`document.querySelector('[aria-label="Dark mode"]')`);
    await sleep(1000);
    await d.shot("28-dark-mode.png");
    await d.click(`document.querySelector('[aria-label="Dark mode"]')`);
    await sleep(800);

    await d.view("Library");
    await d.waitFor(`document.body.innerText.includes("My Palia Fish")`, "the library with the save");
    await d.messagesGone();
    await d.shot("13-library-with-save.png");

    // Template editor (Fish).
    await d.clickText("Edit", "document", 0);
    await d.waitFor(
        `document.querySelector(".ant-tabs") && document.querySelector(".ItemCard")`,
        "the template editor"
    );
    await sleep(1000);
    await d.shot("14-template-items.png");
    await d.typeInto(searchInput, "Ancient Cloudminnow");
    await sleep(800);
    await d.click(`${card("Ancient Cloudminnow")}.querySelector(".ItemCard-name")`);
    await d.waitFor(drawer, "the template item drawer");
    await sleep(900);
    await d.shot("15-template-item-drawer.png");
    await page.evaluate(
        `(() => { const b = ${drawer}.querySelector(".ant-drawer-body"); b.scrollTop = b.scrollHeight; return true; })()`
    );
    await sleep(500);
    await d.shot("16-template-item-drawer-unique.png");
    await d.click(`${drawer}.querySelector(".ant-drawer-close")`);
    await d.waitFor(`!${drawer}`, "the drawer to close");
    await d.clearInput(searchInput);
    await d.tab("Categories", "17-template-categories.png");
    await d.tab("Counters", "18-template-counters.png");
    await d.tab("Variants", "19-template-variants.png");
    await d.tab("Attributes", "20-template-attributes.png");
    await d.tab("Tags", "21-template-tags.png");
    await d.tab("Details", "22-template-details.png");
    await d.tab("Items");

    // A new template of your own.
    await d.view("Library");
    await d.clickText("New template");
    await d.waitFor(modal, "the new template dialog");
    await sleep(500);
    await d.typeInto(`${modal}.querySelector('input[aria-label="New template name"]')`, "My Game – Collectibles");
    await d.typeInto(`${modal}.querySelector('input[aria-label="New template game"]')`, "My Game");
    await d.shot("23-new-template-dialog.png", modalBox);
    await d.clickText("Create", modal);
    await d.waitFor(`document.querySelector(".ant-tabs")`, "the new template");
    await sleep(800);
    await d.tab("Counters", "24-counters-empty.png");
    await d.clickText("Add common counters");
    await sleep(800);
    await d.shot("25-counters-common.png");
    await d.tab("Categories");
    await d.typeInto(`[...document.querySelectorAll("input")].find(e => e.placeholder === "New category")`, "Gems");
    await d.clickText("Add category");
    await sleep(600);
    await d.tab("Items");
    await d.clickText("Add item");
    await d.waitFor(drawer, "the new item drawer");
    await sleep(700);
    await d.typeInto(`${drawer}.querySelector("input")`, "Blue gem");
    const { root } = await page.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: -1, pierce: true });
    const { nodeIds } = await page.send<{ nodeIds: number[] }>("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: ".ant-drawer input[type=file]",
    });
    await page.send("DOM.setFileInputFiles", { files: [imageFile], nodeId: nodeIds.at(-1) });
    await d.waitFor(modal, "the image preview");
    await sleep(1200);
    await d.shot("26-image-preview.png", modalBox);
    await d.clickText("Accept", modal);
    await d.waitFor(`!${modal}`, "the image to be accepted");
    await sleep(1000);
    await d.shot("27-new-item-drawer.png");
};

const waitForChrome = async (port: string) => {
    for (let i = 0; i < 100; i++) {
        try {
            await fetch(`http://127.0.0.1:${port}/json/version`);
            return;
        } catch {
            await sleep(100);
        }
    }
    throw new Error(`Chrome did not open the debugging port ${port}`);
};

const main = async () => {
    const outDir = resolve(values.out);
    await mkdir(outDir, { recursive: true });
    const server = await createServer({ logLevel: "warn", server: { port: 5173, strictPort: false } });
    await server.listen();
    const appUrl = server.resolvedUrls?.local[0];
    if (!appUrl) {
        throw new Error("The dev server has no local URL");
    }
    const profile = await mkdtemp(join(tmpdir(), "git-screenshots-"));
    let chrome: ChildProcess | undefined;
    try {
        chrome = spawn(
            findChrome(),
            [
                "--headless=new",
                `--remote-debugging-port=${values.port}`,
                `--user-data-dir=${profile}`,
                `--window-size=${width},${height}`,
                "--hide-scrollbars",
                "--lang=en-US",
                "--no-first-run",
                "about:blank",
            ],
            { stdio: "ignore" }
        );
        await waitForChrome(values.port);
        const page = await Page.open(values.port);
        try {
            await capture(page, appUrl, outDir, resolve(values.image));
        } finally {
            page.close();
        }
        console.log(`Screenshots written to ${outDir}`);
    } finally {
        chrome?.kill();
        await server.close();
        await sleep(500);
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
    }
};

main().then(
    () => process.exit(0),
    error => {
        console.error(error);
        process.exit(1);
    }
);
