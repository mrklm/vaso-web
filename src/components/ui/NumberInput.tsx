import { useCallback, useState, useEffect } from "react";

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
}

export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  integer = false,
  disabled = false,
}: NumberInputProps) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(integer ? String(Math.round(value)) : String(value));
  }, [value, integer]);

  const clamp = useCallback(
    (v: number) => {
      if (integer) v = Math.round(v);
      v = Math.max(min, Math.min(max, v));
      return v;
    },
    [min, max, integer],
  );

  const commitText = useCallback(() => {
    let v = parseFloat(local);
    if (isNaN(v)) {
      setLocal(String(value));
      return;
    }
    v = clamp(v);
    setLocal(integer ? String(v) : String(v));
    onChange(v);
  }, [local, value, onChange, clamp, integer]);

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = parseFloat(e.target.value);
      if (integer) v = Math.round(v);
      setLocal(integer ? String(v) : String(v));
      onChange(v);
    },
    [onChange, integer],
  );

  return (
    <div className="slider-input">
      <div className="slider-input-header">
        <label>{label}</label>
        <input
          type="number"
          className="slider-input-number"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
        />
      </div>
      <input
        type="range"
        className="slider-input-range"
        value={value}
        onChange={handleSlider}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </div>
  );
}
