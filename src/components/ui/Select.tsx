interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SelectProps<T>) {
  return (
    <div className="select-input">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} disabled={disabled}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
