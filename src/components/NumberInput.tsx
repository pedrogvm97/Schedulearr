'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    value: number;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    step?: number;
    fallback?: number;
    onCommit?: (val: number) => void;
    className?: string;
    title?: string;
}

/**
 * Robust NumberInput component that allows natural typing without premature clamping or jumping.
 * While the user is typing, raw input is preserved (e.g. typing '8' to type '80' will not snap to min/fallback).
 * Normalization, clamping to [min, max], and persistence occur on blur or Enter key press.
 */
export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    fallback,
    onCommit,
    className = '',
    title,
    ...rest
}: NumberInputProps) {
    const [text, setText] = useState<string>(() => (value !== undefined && value !== null && !isNaN(value) ? String(value) : ''));
    const isFocusedRef = useRef(false);

    // Synchronize with external value changes ONLY when the user is not actively typing/focused
    useEffect(() => {
        if (!isFocusedRef.current) {
            setText(value !== undefined && value !== null && !isNaN(value) ? String(value) : '');
        }
    }, [value]);

    const commitValue = (raw: string) => {
        let num = parseInt(raw, 10);
        if (isNaN(num)) {
            num = fallback !== undefined ? fallback : (min !== undefined ? min : (value || 0));
        }
        if (min !== undefined && num < min) {
            num = min;
        }
        if (max !== undefined && num > max) {
            num = max;
        }
        setText(String(num));
        onChange(num);
        onCommit?.(num);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setText(val);

        // If the typed value is already a complete, valid number within the allowed range,
        // update the parent state optimistically without forcing or reformatting the input text
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && String(parsed) === val.trim()) {
            if ((min === undefined || parsed >= min) && (max === undefined || parsed <= max)) {
                onChange(parsed);
            }
        }
    };

    const handleBlur = () => {
        isFocusedRef.current = false;
        commitValue(text);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        isFocusedRef.current = true;
        // Optionally select all text on focus for quick replacement
        e.target.select();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commitValue(text);
            e.currentTarget.blur();
        } else if (e.key === 'Escape') {
            setText(String(value));
            e.currentTarget.blur();
        }
    };

    return (
        <input
            {...rest}
            type="number"
            min={min}
            max={max}
            step={step}
            value={text}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            title={title}
            className={className}
        />
    );
}
