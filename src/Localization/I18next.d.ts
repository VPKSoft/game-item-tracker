import "i18next";
import type { en } from "./Locales/En.ts";

// Makes translation keys type-checked: t("library.newSave") compiles, a typo does not.
declare module "i18next" {
    interface CustomTypeOptions {
        defaultNS: "translation";
        resources: { translation: typeof en };
    }
}
