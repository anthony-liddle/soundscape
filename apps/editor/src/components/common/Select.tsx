import React from 'react';
import { Tooltip } from './Tooltip';
import './Select.css';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  label?: string;
  tooltip?: string;
  onChange: (value: string) => void;
}

export function Select({ value, options, label, tooltip, onChange }: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="select-container">
      {label && (
        <label className="select-label">
          {tooltip ? (
            <Tooltip text={tooltip}>
              {label}
              <span className="tooltip-hint">?</span>
            </Tooltip>
          ) : label}
        </label>
      )}
      <select className="select-input" value={value} onChange={handleChange}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
