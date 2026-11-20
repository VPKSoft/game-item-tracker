import { faImage } from "@fortawesome/free-regular-svg-icons";
import { faCircleCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Checkbox, Empty, Popconfirm, Progress, Tooltip, theme } from "antd";
import classNames from "classnames";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { styled } from "styled-components";
import { CounterStepper } from "../Components/CounterStepper.tsx";
import { findRoleCounter } from "../Domain/Counters.ts";
import { getMaterialNeeds, isMaterialComplete, type MaterialNeed } from "../Domain/Materials.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";

type Props = {
    open: boolean;
    onClose: () => void;
    template: Template;
    save: Save;
    /** Sets the gathered amount of one material. */
    onGatheredChange: (materialId: string, value: number) => void;
    /** Sets the gathered amount of every material to 0. */
    onClear: () => void;
} & BaseProps;

const hideCompleteKey = "materials:hideComplete";

const loadHideComplete = () => {
    try {
        return localStorage.getItem(hideCompleteKey) === "true";
    } catch {
        return false;
    }
};

/**
 * The materials list of a save: what the planned items need (Σ planned × amount per item), how much of each
 * material is gathered (stored in the save), and whether that is enough. A side column next to the item grid,
 * like the exchange list, so it stays visible while the planned amounts change.
 */
let MaterialsPanel = ({ className, open, onClose, template, save, onGatheredChange, onClear }: Props) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [hideComplete, setHideComplete] = React.useState(loadHideComplete);

    React.useEffect(() => {
        try {
            localStorage.setItem(hideCompleteKey, String(hideComplete));
        } catch {
            // Storage can be unavailable; the option is just not remembered.
        }
    }, [hideComplete]);

    const needs = React.useMemo(() => (open ? getMaterialNeeds(template, save) : []), [open, template, save]);

    if (!open) {
        return null;
    }

    const planned = findRoleCounter(template, "planned");
    const required = needs.filter(n => n.needed > 0);
    const done = required.filter(isMaterialComplete).length;
    const shown = hideComplete ? needs.filter(n => n.needed > 0 && !isMaterialComplete(n)) : needs;
    const hasGathered = Object.keys(save.gathered ?? {}).length > 0;

    const renderNeed = (need: MaterialNeed) => {
        const { material } = need;
        const image = material.imageId ? template.images[material.imageId] : undefined;
        const complete = need.needed > 0 && isMaterialComplete(need);
        const uses = need.uses.map(u =>
            t("materials.usedBy", { item: u.item.name, planned: u.planned, perItem: u.perItem })
        );
        return (
            <div
                key={material.id}
                className={classNames("MaterialsPanel-row", complete && "MaterialsPanel-complete")}
                data-testid={`material-${material.id}`}
            >
                <div className="MaterialsPanel-thumb">
                    {image ? <img src={image} alt="" /> : <FontAwesomeIcon icon={faImage} />}
                </div>
                <Tooltip title={uses.length > 0 ? uses.map(u => <div key={u}>{u}</div>) : undefined}>
                    <div className="MaterialsPanel-text">
                        <div className="MaterialsPanel-name" title={material.name}>
                            {material.name}
                        </div>
                        <div className="MaterialsPanel-needed">{t("materials.needed", { count: need.needed })}</div>
                    </div>
                </Tooltip>
                <CounterStepper
                    label={t("materials.gathered")}
                    value={need.gathered}
                    onChange={value => onGatheredChange(material.id, value)}
                />
                <div className="MaterialsPanel-status">
                    {complete ? (
                        <Tooltip title={t("materials.enough")}>
                            <FontAwesomeIcon
                                icon={faCircleCheck}
                                aria-label={t("materials.enough")}
                                style={{ color: token.colorSuccess }}
                            />
                        </Tooltip>
                    ) : need.needed > 0 ? (
                        <span style={{ color: token.colorWarning }}>
                            {t("materials.missing", { count: need.needed - need.gathered })}
                        </span>
                    ) : null}
                </div>
            </div>
        );
    };

    return (
        <aside
            className={classNames(className, "MaterialsPanel")}
            aria-label={t("materials.title")}
            style={{
                background: token.colorBgContainer,
                borderColor: token.colorBorderSecondary,
                borderRadius: token.borderRadiusLG,
            }}
        >
            <div className="MaterialsPanel-header" style={{ borderColor: token.colorBorderSecondary }}>
                <Button
                    type="text"
                    size="small"
                    aria-label={t("common.close")}
                    icon={<FontAwesomeIcon icon={faXmark} />}
                    onClick={onClose}
                />
                <div className="MaterialsPanel-title">{t("materials.title")}</div>
                <Popconfirm
                    title={t("materials.clearTitle")}
                    okText={t("materials.clear")}
                    onConfirm={onClear}
                    disabled={!hasGathered}
                >
                    <Button size="small" disabled={!hasGathered}>
                        {t("materials.clear")}
                    </Button>
                </Popconfirm>
            </div>
            <div className="MaterialsPanel-content">
                <div className="MaterialsPanel-hint">{t("materials.help", { counter: planned?.label ?? "" })}</div>
                {required.length > 0 && (
                    <div>
                        <div>{t("materials.summary", { done, total: required.length })}</div>
                        <Progress size="small" percent={Math.round((done / required.length) * 100)} showInfo={false} />
                    </div>
                )}
                <Checkbox checked={hideComplete} onChange={e => setHideComplete(e.target.checked)}>
                    {t("materials.hideComplete")}
                </Checkbox>
                {needs.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t("materials.empty", { counter: planned?.label ?? "" })}
                    />
                ) : (
                    shown.map(renderNeed)
                )}
            </div>
        </aside>
    );
};

MaterialsPanel = styled(MaterialsPanel)`
    width: 400px;
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-width: 1px;
    border-style: solid;
    @media (max-width: 760px) {
        width: auto;
        max-height: 50%;
    }
    .MaterialsPanel-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom-width: 1px;
        border-bottom-style: solid;
    }
    .MaterialsPanel-title {
        flex: 1;
        font-weight: 600;
        font-size: 1.1em;
    }
    .MaterialsPanel-content {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px 16px;
        overflow-y: auto;
        min-height: 0;
        flex: 1;
    }
    .MaterialsPanel-hint {
        font-size: 0.85em;
        opacity: 0.7;
    }
    .MaterialsPanel-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .MaterialsPanel-complete .MaterialsPanel-text {
        opacity: 0.6;
    }
    .MaterialsPanel-thumb {
        width: 32px;
        height: 32px;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        img {
            max-width: 32px;
            max-height: 32px;
        }
    }
    .MaterialsPanel-text {
        flex: 1;
        min-width: 0;
    }
    .MaterialsPanel-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .MaterialsPanel-needed {
        font-size: 0.8em;
        opacity: 0.75;
    }
    .MaterialsPanel-status {
        width: 64px;
        flex: none;
        text-align: right;
        font-size: 0.85em;
        white-space: nowrap;
    }
`;

export { MaterialsPanel };
