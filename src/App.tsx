import * as React from "react";
import "./App.css";
import { faMoon, faSun } from "@fortawesome/free-regular-svg-icons";
import { faGear, faInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Segmented, Switch, Tooltip } from "antd";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { useAntdTheme, useAntdToken } from "./Context/AntdThemeContext.tsx";
import type { ExchangeEntry } from "./Domain/Exchange.ts";
import { AboutPopup } from "./Popups/AboutPopup.tsx";
import { SettingsPopup } from "./Popups/SettingsPopup.tsx";
import { PwaBadge } from "./PwaBadge.tsx";
import { requestPersistentStorage } from "./Storage/Database.ts";
import type { BaseProps } from "./Types/BaseTypes.ts";
import { useLocalStorage } from "./Utilities/UseLocalStorage.tsx";
import { InventoryEditor } from "./Views/InventoryEditor.tsx";
import { Library } from "./Views/Library.tsx";
import { TemplateEditor, type TemplateKey } from "./Views/TemplateEditor.tsx";

type View = "inventory" | "templates" | "library";

type Props = {} & BaseProps;

let App = ({ className }: Props) => {
    // Local storage
    const [setItem, , getItem] = useLocalStorage();

    // Antd theme selection design token
    const { token } = useAntdToken();

    // Pure state
    const { setTheme, updateBackground } = useAntdTheme();
    const [aboutPopupVisible, setAboutPopupVisible] = React.useState(false);
    const [settingsPopupVisible, setSettingsPopupVisible] = React.useState(false);
    // Exchange lists by save id. Deliberately only in memory: they are quick, throwaway lists.
    const [exchangeLists, setExchangeLists] = React.useState<Record<string, ExchangeEntry[]>>({});
    const { t } = useTranslation();

    // Persistent state
    const [darkMode, setDarkMode] = React.useState<boolean>(getItem<boolean>("darkMode", false));
    const [view, setView] = React.useState<View>(getItem<View>("view", "library"));
    const [saveId, setSaveId] = React.useState<string | null>(getItem<string | null>("openSaveId", null));
    const [templateKey, setTemplateKey] = React.useState<TemplateKey | null>(
        getItem<TemplateKey | null>("openTemplate", null)
    );

    React.useEffect(() => {
        void requestPersistentStorage();
    }, []);

    React.useEffect(() => {
        setItem("view", view);
        setItem("openSaveId", saveId);
        setItem("openTemplate", templateKey);
    }, [view, saveId, templateKey, setItem]);

    const openSave = React.useCallback((id: string) => {
        setSaveId(id);
        setView("inventory");
    }, []);

    const openTemplate = React.useCallback((key: TemplateKey) => {
        setTemplateKey(key);
        setView("templates");
    }, []);

    const openLibrary = React.useCallback(() => setView("library"), []);

    const updateExchangeList = React.useCallback(
        (id: string, update: (entries: ExchangeEntry[]) => ExchangeEntry[]) =>
            setExchangeLists(lists => ({ ...lists, [id]: update(lists[id] ?? []) })),
        []
    );

    React.useEffect(() => {
        setTheme?.(darkMode ? "dark" : "light");
        updateBackground?.(token);
    }, [darkMode, setTheme, updateBackground, token]);

    React.useEffect(() => {
        setItem("darkMode", darkMode);
    }, [darkMode, setItem]);

    const onLightDarkSwitchChangeEventHandler = React.useCallback((checked: boolean) => {
        setDarkMode(checked);
    }, []);

    const showAboutClick = React.useCallback(() => {
        setAboutPopupVisible(true);
    }, []);

    return (
        <div id="App" className={classNames(className, App.name)}>
            <div className="App-toolbar">
                <Segmented<View>
                    value={view}
                    onChange={setView}
                    options={[
                        { value: "inventory", label: t("app.inventory") },
                        { value: "templates", label: t("app.templates") },
                        { value: "library", label: t("app.library") },
                    ]}
                />
                <div className="App-toolbar-spacer" />
                <Switch
                    className="App-toolbar-switch"
                    checkedChildren={<FontAwesomeIcon icon={faMoon} />}
                    unCheckedChildren={<FontAwesomeIcon icon={faSun} />}
                    checked={darkMode}
                    onChange={onLightDarkSwitchChangeEventHandler}
                    aria-label={t("app.darkMode")}
                />
                <Tooltip title={t("app.settings")}>
                    <Button //
                        icon={<FontAwesomeIcon icon={faGear} />}
                        onClick={() => setSettingsPopupVisible(true)}
                        className="Toolbar-button"
                        aria-label={t("app.settings")}
                    />
                </Tooltip>
                <Tooltip title={t("app.about")}>
                    <Button //
                        icon={<FontAwesomeIcon icon={faInfo} />}
                        onClick={showAboutClick}
                        className="Toolbar-button"
                        aria-label={t("app.about")}
                    />
                </Tooltip>
            </div>
            <div className="App-content">
                {view === "inventory" && (
                    <InventoryEditor
                        saveId={saveId}
                        onOpenLibrary={openLibrary}
                        exchangeEntries={saveId ? exchangeLists[saveId] : undefined}
                        onExchangeChange={updateExchangeList}
                    />
                )}
                {view === "templates" && (
                    <TemplateEditor
                        templateKey={templateKey}
                        onOpenTemplate={openTemplate}
                        onOpenLibrary={openLibrary}
                    />
                )}
                {view === "library" && <Library onOpenSave={openSave} onOpenTemplate={openTemplate} />}
            </div>

            <AboutPopup //
                visible={aboutPopupVisible}
                onClose={() => setAboutPopupVisible(false)}
                darkMode={darkMode}
            />

            <SettingsPopup //
                visible={settingsPopupVisible}
                onClose={() => setSettingsPopupVisible(false)}
            />

            <PwaBadge />
        </div>
    );
};

App = styled(App)`
    display: flex;
    flex-direction: column;
    height: 100vh;
    .App-toolbar {
        margin-top: 10px;
        margin-left: 10px;
        margin-right: 10px;
        display: flex;
        flex-direction: row;
        gap: 10px;
        flex-wrap: wrap;
    }
    .App-toolbar-spacer {
        flex: 1;
    }
    .App-toolbar-switch {
        align-self: center;
    }
    .App-content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        margin: 10px;
    }
    .Toolbar-button {
        min-width: 40px;
    }
`;

export { App };
