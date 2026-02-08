import React from 'react';
import './Slider.css';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  tooltip?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  vertical?: boolean;
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  tooltip,
  showValue = true,
  formatValue = (v) => v.toFixed(2),
  onChange,
  vertical = false,
}: SliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div className={`slider-container ${vertical ? 'slider-vertical' : ''}`}>
      {(label || showValue) && (
        <div className="slider-top-row">
          {label && <label className="slider-label" title={tooltip}>{label}</label>}
          {showValue && <span className="slider-value">{formatValue(value)}</span>}
        </div>
      )}
      <input
        type="range"
        className="slider-input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
      />
    </div>
  );
}
