/** Values inserted into the `{{name}}` placeholders of a message. */
type MessageParams = Record<string, string | number>;

/**
 * A user-facing message from non-UI code. The UI translates it by `code` (key `messages.<code>`);
 * `message` is the English text, used by scripts, tests and as a fallback.
 */
type LocalizedMessage<C extends string = string> = {
    code: C;
    params?: MessageParams;
    message: string;
};

/** Replaces the `{{name}}` placeholders of a message template with the given values. */
const formatMessage = (template: string, params?: MessageParams) =>
    template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
        params && name in params ? String(params[name]) : match
    );

/** Creates a {@link LocalizedMessage} from a table of English message templates. */
const createMessage = <C extends string>(
    templates: Record<C, string>,
    code: C,
    params?: MessageParams
): LocalizedMessage<C> => ({
    code,
    ...(params ? { params } : {}),
    message: formatMessage(templates[code], params),
});

/** An error whose message the UI can translate by its `code`. */
class LocalizedError<C extends string = string> extends Error {
    readonly code: C;
    readonly params?: MessageParams;

    constructor(templates: Record<C, string>, code: C, params?: MessageParams) {
        super(formatMessage(templates[code], params));
        this.name = "LocalizedError";
        this.code = code;
        this.params = params;
    }
}

export type { LocalizedMessage, MessageParams };
export { createMessage, formatMessage, LocalizedError };
