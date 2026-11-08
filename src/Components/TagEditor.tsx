import { Select } from "antd";
import { useTranslation } from "react-i18next";

type Props = {
    value: string[];
    onChange: (tags: string[]) => void;
    /** Predefined tags offered as suggestions. */
    suggestions: string[];
    placeholder?: string;
};

/** Edits a list of tags: choose from the predefined tags or type new ones. */
const TagEditor = ({ value, onChange, suggestions, placeholder }: Props) => {
    const { t } = useTranslation();
    return (
        <Select
            mode="tags"
            style={{ width: "100%" }}
            value={value}
            onChange={tags => onChange([...new Set(tags.map(tag => tag.trim()).filter(tag => tag.length > 0))])}
            options={suggestions.map(tag => ({ value: tag, label: tag }))}
            placeholder={placeholder ?? t("tagEditor.placeholder")}
            tokenSeparators={[","]}
            aria-label={t("common.tags")}
        />
    );
};

export { TagEditor };
