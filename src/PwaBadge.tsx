import { Button, Space, theme } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import "./PwaBadge.css";

import { useRegisterSW } from "virtual:pwa-register/react";

const PwaBadge = () => {
    const { t } = useTranslation();
    const { token } = theme.useToken();

    // check for updates every hour
    const period = 60 * 60 * 1000;

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(swUrl, r) {
            if (period <= 0) {
                return;
            }
            if (r?.active?.state === "activated") {
                registerPeriodicSync(period, swUrl, r);
            } else if (r?.installing) {
                r.installing.addEventListener("statechange", e => {
                    const sw = e.target as ServiceWorker;
                    if (sw.state === "activated") {
                        registerPeriodicSync(period, swUrl, r);
                    }
                });
            }
        },
    });

    const reload = React.useCallback(() => {
        // workbox-window reloads by itself only when a service worker controlled the page when it loaded.
        // On a first visit none did, so reload when the new worker takes control.
        navigator.serviceWorker?.addEventListener("controllerchange", () => window.location.reload(), { once: true });
        void updateServiceWorker(true);
    }, [updateServiceWorker]);

    const close = React.useCallback(() => {
        setNeedRefresh(false);
    }, [setNeedRefresh]);

    return (
        <div className="PWABadge" role="alert" aria-labelledby="toast-message">
            {needRefresh && (
                <div
                    className="PWABadge-toast"
                    style={{
                        background: token.colorBgElevated,
                        color: token.colorText,
                        borderColor: token.colorBorderSecondary,
                        borderRadius: token.borderRadiusLG,
                        boxShadow: token.boxShadowSecondary,
                    }}
                >
                    <div className="PWABadge-message">
                        <span id="toast-message">{t("pwa.newContent")}</span>
                    </div>
                    <Space>
                        <Button type="primary" size="small" onClick={reload}>
                            {t("pwa.reload")}
                        </Button>
                        <Button size="small" onClick={() => close()}>
                            {t("common.close")}
                        </Button>
                    </Space>
                </div>
            )}
        </div>
    );
};

/**
 * This function will register a periodic sync check every hour, you can modify the interval as needed.
 */
const registerPeriodicSync = (period: number, swUrl: string, r: ServiceWorkerRegistration) => {
    if (period <= 0) {
        return;
    }

    setInterval(async () => {
        if ("onLine" in navigator && !navigator.onLine) {
            return;
        }

        const resp = await fetch(swUrl, {
            cache: "no-store",
            headers: {
                cache: "no-store",
                "cache-control": "no-cache",
            },
        });

        if (resp?.status === 200) {
            await r.update();
        }
    }, period);
};

export { PwaBadge };
