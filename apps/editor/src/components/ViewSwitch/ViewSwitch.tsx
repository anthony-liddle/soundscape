import './ViewSwitch.css';

export type View = 'song' | 'cues';

const LABELS: Record<View, string> = { song: 'Song', cues: 'Cues' };

/** The header's switch between the editor's views. The current one is marked in text, not colour alone. */
export function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="view-switch" aria-label="Views">
      {(Object.keys(LABELS) as View[]).map((v) => (
        <button
          key={v}
          type="button"
          className={`view-switch-btn ${v === view ? 'view-switch-current' : ''}`}
          aria-current={v === view ? 'page' : undefined}
          onClick={() => onChange(v)}
        >
          {LABELS[v]}
        </button>
      ))}
    </nav>
  );
}
