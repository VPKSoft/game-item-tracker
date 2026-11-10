import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App as AntdApp } from "antd";
import { useTranslation } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { fishTemplate } from "../Domain/TestFixtures.ts";
import { validateTemplate } from "../Domain/Validation.ts";
import { parseFileText } from "../Files/FileFormat.ts";
import { imageMessages } from "../Images/ImageMessages.ts";
import { SettingsPopup } from "../Popups/SettingsPopup.tsx";
import { LocalizedError } from "../Types/LocalizedMessage.ts";
import { getStoredLanguage, i18next, languageStorageKey, setLanguage } from "./I18n.ts";
import { en } from "./Locales/En.ts";
import { fi } from "./Locales/Fi.ts";
import { translateError, translateMessage } from "./Messages.ts";

/** Flattens a translation tree into "a.b.c" → text. */
const flatten = (tree: object, prefix = ""): Map<string, string> => {
    const result = new Map<string, string>();
    for (const [key, value] of Object.entries(tree)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") {
            result.set(path, value);
        } else {
            for (const [k, v] of flatten(value as object, path)) {
                result.set(k, v);
            }
        }
    }
    return result;
};

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort();

afterEach(async () => {
    localStorage.clear();
    await i18next.changeLanguage("en");
});

describe("translations", () => {
    it("have the same keys in every language", () => {
        expect([...flatten(fi).keys()].sort()).toEqual([...flatten(en).keys()].sort());
    });

    it("use the same placeholders in every language", () => {
        const finnish = flatten(fi);
        for (const [key, text] of flatten(en)) {
            expect({ key, placeholders: placeholders(finnish.get(key) ?? "") }).toEqual({
                key,
                placeholders: placeholders(text),
            });
        }
    });

    it("contain every message of the non-UI code", () => {
        expect(en.messages.duplicateRole).toBe('Only one counter can have the role "{{role}}"');
        expect(en.messages.invalidJson).toBe("The file is not valid JSON.");
        expect(en.messages.notAnImage).toBe("The file is not an image.");
    });
});

describe("language selection", () => {
    it("defaults to English", () => {
        expect(getStoredLanguage()).toBe("en");
        expect(i18next.language).toBe("en");
    });

    it("ignores an unsupported stored language", () => {
        localStorage.setItem(languageStorageKey, JSON.stringify("sv"));
        expect(getStoredLanguage()).toBe("en");
        localStorage.setItem(languageStorageKey, "not json");
        expect(getStoredLanguage()).toBe("en");
    });

    it("remembers the chosen language", async () => {
        await setLanguage("fi");
        expect(i18next.language).toBe("fi");
        expect(getStoredLanguage()).toBe("fi");
        expect(document.documentElement.lang).toBe("fi");
    });

    it("translates messages of the non-UI code", async () => {
        const template = fishTemplate();
        template.counterDefs = template.counterDefs.map(c => ({ ...c, role: "owned" as const }));
        const issue = validateTemplate(template).find(i => i.code === "duplicateRole");
        expect(issue).toBeDefined();
        if (!issue) {
            return;
        }
        expect(translateMessage(i18next.t, issue)).toBe(issue.message);
        await setLanguage("fi");
        expect(translateMessage(i18next.t, issue)).toBe("Vain yhdellä laskurilla voi olla rooli ”owned”");

        const parsed = parseFileText("{nope");
        expect(parsed.kind === "error" && translateMessage(i18next.t, parsed)).toBe(
            "Tiedosto ei ole kelvollista JSONia."
        );
        expect(translateError(i18next.t, new LocalizedError(imageMessages, "imageTooLarge", { size: "12.0" }))).toBe(
            "Kuva on liian suuri (12.0 Mt). Enimmäiskoko on 10 Mt."
        );
        expect(translateError(i18next.t, new Error("plain"))).toBe("plain");
    });
});

const Probe = () => {
    const { t } = useTranslation();
    return <div data-testid="probe">{t("app.library")}</div>;
};

describe("SettingsPopup", () => {
    it("switches the UI language", async () => {
        render(
            <AntdApp>
                <Probe />
                <SettingsPopup visible onClose={() => undefined} />
            </AntdApp>
        );
        expect(screen.getByTestId("probe")).toHaveTextContent("Library");
        await userEvent.click(screen.getByRole("combobox", { name: "Language" }));
        await userEvent.click(await screen.findByText("Suomi"));
        await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("Kirjasto"));
        expect(screen.getByText("Kieli")).toBeInTheDocument();
        expect(getStoredLanguage()).toBe("fi");
    });
});
