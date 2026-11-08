import * as React from "react";
import "./App.css";
import { faMoon, faSun } from "@fortawesome/free-regular-svg-icons";
import { faInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Switch, Tooltip } from "antd";
import classNames from "classnames";
import styled from "styled-components";
import { useAntdTheme, useAntdToken } from "./Context/AntdThemeContext.tsx";
import { AboutPopup } from "./Popups/AboutPopup.tsx";
import { PwaBadge } from "./PwaBadge.tsx";
import type { BaseProps } from "./Types/BaseTypes.ts";
import { useLocalStorage } from "./Utilities/UseLocalStorage.tsx";

type Props = {} & BaseProps;

let App = ({ className }: Props) => {
    // Local storage
    const [setItem, , getItem] = useLocalStorage();

    // Antd theme selection design token
    const { token } = useAntdToken();

    // Pure state
    const { setTheme, updateBackground } = useAntdTheme();
    const [aboutPopupVisible, setAboutPopupVisible] = React.useState(false);

    // Persistent state
    const [darkMode, setDarkMode] = React.useState<boolean>(getItem<boolean>("darkMode", false));

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
                <Switch
                    className="App-toolbar-switch"
                    checkedChildren={<FontAwesomeIcon icon={faMoon} />}
                    unCheckedChildren={<FontAwesomeIcon icon={faSun} />}
                    checked={darkMode}
                    onChange={onLightDarkSwitchChangeEventHandler}
                />
                <Tooltip title="About">
                    <Button //
                        icon={<FontAwesomeIcon icon={faInfo} />}
                        onClick={showAboutClick}
                        className="Toolbar-button"
                    />
                </Tooltip>
            </div>
            <div className="App-content" />

            <AboutPopup //
                visible={aboutPopupVisible}
                onClose={() => setAboutPopupVisible(false)}
                darkMode={darkMode}
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
    .App-toolbar-switch {
        align-self: center;
    }
    .App-content {
        height: 100%;
        overflow: auto;
        margin: 10px;
    }
    .Toolbar-button {
        min-width: 40px;
    }
`;

export { App };
