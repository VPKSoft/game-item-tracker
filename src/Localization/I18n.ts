import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./Locales/En.ts";
import { fi } from "./Locales/Fi.ts";

/** The supported UI languages. The names are shown in their own language. */
const languages = [
    { code: "en", name: "English" },
    { code: "fi", name: "Suomi" },
] as const;

/** A supported UI language code. */
type Language = (typeof languages)[number]["code"];

/** The language used until the user picks another one in the settings. The browser language is ignored. */
const defaultLanguage: Language = "en";

/** The localStorage key of the chosen language (JSON-encoded like the other UI preferences). */
const languageStorageKey = "language";

/** Gets a value indicating whether the value is a supported language code. */
const isLanguage = (value: unknown): value is Language => languages.some(l => l.code === value);

/** Gets the language chosen in the settings, or English when none (or an unsupported one) is stored. */
const getStoredLanguage = (): Language => {
    try {
        const raw = localStorage.getItem(languageStorageKey);
        const value: unknown = raw ? JSON.parse(raw) : null;
        return isLanguage(value) ? value : defaultLanguage;
    } catch {
        return defaultLanguage;
    }
};

/** Switches the UI language and remembers the choice. */
const setLanguage = async (language: Language) => {
    try {
        localStorage.setItem(languageStorageKey, JSON.stringify(language));
    } catch {
        // Storage can be unavailable; the language then applies to this session only.
    }
    await i18next.changeLanguage(language);
};

/** Gets the current UI language. */
const getLanguage = (): Language => (isLanguage(i18next.language) ? i18next.language : defaultLanguage);

const resources = {
    en: { translation: en },
    fi: { translation: fi },
} as const;

i18next.on("languageChanged", language => {
    if (typeof document !== "undefined") {
        document.documentElement.lang = language;
    }
});

void i18next.use(initReactI18next).init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: defaultLanguage,
    supportedLngs: languages.map(l => l.code),
    interpolation: { escapeValue: false }, // React escapes the output.
    initAsync: false,
});

export type { Language };
export {
    defaultLanguage,
    getLanguage,
    getStoredLanguage,
    i18next,
    isLanguage,
    languageStorageKey,
    languages,
    setLanguage,
};
