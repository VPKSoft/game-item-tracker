import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, InputNumber, Space } from "antd";
import classNames from "classnames";
import type * as React from "react";
import { styled } from "styled-components";
import type { BaseProps } from "../Types/BaseTypes.ts";

type Props = {
    label: string;
    value: number;
    /** Undefined makes the stepper read-only (computed counters). */
    onChange?: (value: number) => void;
    max?: number;
    size?: "small" | "middle";
} & BaseProps;

/**
 * A compact "− [n] +" counter. Shift-click steps by 10. Read-only when no change handler is given.
 */
let CounterStepper = ({ className, label, value, onChange, max, size = "small" }: Props) => {
    const step = (event: React.MouseEvent, delta: number) => {
        event.stopPropagation();
        const amount = event.shiftKey ? delta * 10 : delta;
        let next = Math.max(0, value + amount);
        if (max !== undefined) {
            next = Math.min(max, next);
        }
        onChange?.(next);
    };

    return (
        <div className={classNames(className, "CounterStepper")} onClick={e => e.stopPropagation()}>
            <div className="CounterStepper-label">{label}</div>
            {onChange ? (
                <Space.Compact size={size}>
                    <Button
                        aria-label={`Decrease ${label}`}
                        icon={<FontAwesomeIcon icon={faMinus} />}
                        onClick={e => step(e, -1)}
                        disabled={value <= 0}
                    />
                    <InputNumber
                        aria-label={label}
                        className="CounterStepper-input"
                        controls={false}
                        min={0}
                        max={max}
                        precision={0}
                        value={value}
                        onChange={v => onChange(typeof v === "number" ? v : 0)}
                    />
                    <Button
                        aria-label={`Increase ${label}`}
                        icon={<FontAwesomeIcon icon={faPlus} />}
                        onClick={e => step(e, 1)}
                        disabled={max !== undefined && value >= max}
                    />
                </Space.Compact>
            ) : (
                <div className="CounterStepper-computed" aria-label={label}>
                    {value}
                </div>
            )}
        </div>
    );
};

CounterStepper = styled(CounterStepper)`
    display: flex;
    flex-direction: column;
    align-items: center;
    .CounterStepper-label {
        font-size: 0.72em;
        line-height: 1.3;
        opacity: 0.75;
        white-space: nowrap;
    }
    .CounterStepper-input {
        width: 46px;
        input {
            text-align: center;
        }
    }
    .CounterStepper-computed {
        min-width: 40px;
        text-align: center;
        font-weight: 600;
        line-height: 24px;
    }
`;

export { CounterStepper };
