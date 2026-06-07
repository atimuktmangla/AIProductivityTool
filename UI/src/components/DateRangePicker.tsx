import type { ChangeEvent, MouseEvent } from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange:   (date: string) => void;
  onPreset:      (preset: 'last30' | 'currentQuarter' | 'last90') => void;
}

const PRESETS: { label: string; value: 'last30' | 'currentQuarter' | 'last90' }[] = [
  { label: 'Last 30 days',     value: 'last30' },
  { label: 'Current quarter',  value: 'currentQuarter' },
  { label: 'Last 90 days',     value: 'last90' },
];

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onPreset,
}: DateRangePickerProps) {
  const handleStart = (e: ChangeEvent<HTMLInputElement>) => onStartChange(e.target.value);
  const handleEnd   = (e: ChangeEvent<HTMLInputElement>) => onEndChange(e.target.value);
  const handlePreset = (e: MouseEvent<HTMLButtonElement>, preset: typeof PRESETS[0]['value']) => {
    e.preventDefault();
    onPreset(preset);
  };

  return (
    <div className="date-range-picker">
      <div className="date-range-picker__presets">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className="btn btn--ghost"
            onClick={(e) => handlePreset(e, p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="date-range-picker__inputs">
        <label className="date-range-picker__label">
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={handleStart}
            className="date-range-picker__input"
          />
        </label>
        <span className="date-range-picker__sep">–</span>
        <label className="date-range-picker__label">
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={handleEnd}
            className="date-range-picker__input"
          />
        </label>
      </div>
    </div>
  );
}
