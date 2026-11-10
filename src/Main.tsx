import { App as AntdApp } from "antd";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./Localization/I18n.ts";
import { App } from "./App.tsx";
import { AntdThemeProvider } from "./Context/AntdThemeContext.tsx";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AntdThemeProvider>
            <AntdApp>
                <App />
            </AntdApp>
        </AntdThemeProvider>
    </StrictMode>
);
