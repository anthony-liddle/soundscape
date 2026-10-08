import { useState } from 'react';
import type { ReactNode } from 'react';
import { msAsSeconds, nudge, parseNumber, secondsAsMs } from './exact';

interface ExactFieldProps {
  /** The input's id; the readout and problem ids follow from it. */
  id: string;
  /** The accessible name, which says what the value belongs to. */
  name: string;
  /** A visible label, where the table's column header is not one. */
  label?: string;
  value: number;
  /** Edited in milliseconds, stored in seconds. Otherwise edited as stored. */
  inMs?: boolean;
  /** Arrow keys move by `step`, or `bigStep` with Shift, in the field's own unit. */
  step: number;
  bigStep: number;
  /** Arrow keys stop here, in the field's own unit. */
  min?: number;
  readout?: ReactNode;
  /** What the validator says is wrong with this value. */
  problems?: string[];
  onCommit: (value: number) => void;
  onFocus?: () => void;
}

/**
 * A number shown exactly as stored, `String(v)`, and written back only when
 * its text has changed, on Enter or when focus leaves. Escape puts the
 * stored value back. ArrowUp and ArrowDown move it by a step, rounded to the
 * step. Never a range input, which would round the value to its own step.
 */
export function ExactField({
  id,
  name,
  label,
  value,
  inMs = false,
  step,
  bigStep,
  min,
  readout,
  problems = [],
  onCommit,
  onFocus,
}: ExactFieldProps) {
  const shown = inMs ? secondsAsMs(value) : String(value);
  // What is being typed, or null when the field shows the stored value
  const [draft, setDraft] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const read = (text: string) => (inMs ? msAsSeconds(text) : parseNumber(text));

  const commit = () => {
    if (draft === null || draft === shown) {
      setDraft(null);
      setUnreadable(false);
      return;
    }
    const next = read(draft);
    if (next === null) {
      setUnreadable(true);
      return;
    }
    setDraft(null);
    setUnreadable(false);
    onCommit(next);
  };

  const move = (direction: 1 | -1, big: boolean) => {
    const current = inMs ? Number(shown) : value;
    let next = nudge(current, big ? bigStep : step, direction);
    if (min !== undefined) next = Math.max(min, next);
    if (next === current) return;
    setDraft(null);
    setUnreadable(false);
    onCommit(inMs ? msAsSeconds(String(next))! : next);
  };

  const messages = [...(unreadable ? ['Type a number.'] : []), ...problems];
  const invalid = messages.length > 0;
  const describedBy = [readout !== undefined && `${id}-readout`, invalid && `${id}-problem`].filter(Boolean).join(' ');

  return (
    <div className="exact-field">
      {label && (
        <label htmlFor={id} className="exact-label">
          {label}
        </label>
      )}
      <input
        id={id}
        className="exact-input"
        type="text"
        inputMode="decimal"
        spellCheck={false}
        autoComplete="off"
        aria-label={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy || undefined}
        value={draft ?? shown}
        onFocus={onFocus}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') {
            setDraft(null);
            setUnreadable(false);
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
      />
      {readout !== undefined && (
        <span id={`${id}-readout`} className="exact-readout">
          {readout}
        </span>
      )}
      {invalid && (
        <span id={`${id}-problem`} className="exact-problem">
          <span aria-hidden="true">! </span>
          {messages.join(' ')}
        </span>
      )}
    </div>
  );
}
