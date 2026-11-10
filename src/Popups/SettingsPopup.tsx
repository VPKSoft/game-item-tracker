import { Form, Modal, Select } from "antd";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { getLanguage, type Language, languages, setLanguage } from "../Localization/I18n.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";

/**
 * The props for the {@link SettingsPopup} component.
 */
type SettingsPopupProps = {
    /** A value indicating whether this popup is visible. */
    visible: boolean;
    /** Occurs when the popup has been closed. */
    onClose: () => void;
} & BaseProps;

/** The program settings. Changes apply immediately and are remembered in this browser. */
let SettingsPopup = ({ className, visible, onClose }: SettingsPopupProps) => {
    const { t } = useTranslation();

    return (
        <Modal //
            title={t("settings.title")}
            open={visible}
            onCancel={onClose}
            onOk={onClose}
            okText={t("common.close")}
            cancelButtonProps={{ style: { display: "none" } }}
            centered
        >
            <Form layout="vertical" className={classNames(SettingsPopup.name, className)}>
                <Form.Item label={t("settings.language")} extra={t("settings.languageHint")}>
                    <Select<Language>
                        aria-label={t("settings.language")}
                        value={getLanguage()}
                        onChange={language => void setLanguage(language)}
                        options={languages.map(l => ({ value: l.code, label: l.name }))}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

SettingsPopup = styled(SettingsPopup)`
    margin-top: 16px;
`;

export { SettingsPopup };
