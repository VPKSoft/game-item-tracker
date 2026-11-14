import type { TFunction } from "i18next";
import type { ValidationCode } from "../Domain/Validation.ts";
import type { FileMessageCode } from "../Files/FileFormat.ts";
import type { CatalogMessageCode } from "../Files/OnlineCatalog.ts";
import type { ImageMessageCode } from "../Images/ImageMessages.ts";
import { LocalizedError, type LocalizedMessage } from "../Types/LocalizedMessage.ts";

/** Every code of a message from non-UI code; each has a key `messages.<code>` in the translations. */
type MessageCode = ValidationCode | FileMessageCode | ImageMessageCode | CatalogMessageCode;

/** Translates a message from non-UI code into the current UI language. */
const translateMessage = (t: TFunction, message: LocalizedMessage<MessageCode>) =>
    t(`messages.${message.code}`, { ...message.params, defaultValue: message.message });

/** Gets the text of an error in the current UI language; untranslated errors keep their own message. */
const translateError = (t: TFunction, error: unknown) => {
    if (error instanceof LocalizedError) {
        return translateMessage(t, error as LocalizedError<MessageCode>);
    }
    return error instanceof Error ? error.message : String(error);
};

export type { MessageCode };
export { translateError, translateMessage };
