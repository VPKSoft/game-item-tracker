import { Select } from "antd";

type Props = {
    value: string[];
    onChange: (tags: string[]) => void;
    /** Predefined tags offered as suggestions. */
    suggestions: string[];
    placeholder?: string;
};

/** Edits a list of tags: choose from the predefined tags or type new ones. */
const TagEditor = ({ value, onChange, suggestions, placeholder = "Add tags" }: Props) => (
    <Select
        mode="tags"
        style={{ width: "100%" }}
        value={value}
        onChange={tags => onChange([...new Set(tags.map(t => t.trim()).filter(t => t.length > 0))])}
        options={suggestions.map(t => ({ value: t, label: t }))}
        placeholder={placeholder}
        tokenSeparators={[","]}
        aria-label="Tags"
    />
);

export { TagEditor };
