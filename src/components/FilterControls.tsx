import type { Filters } from '../core/types';
import { ACTIONS } from '../core/types';
const SCOPES: [Filters['scope'], string][] = [
  ['selection', 'Text selections'],
  ['paragraph', 'Paragraphs'],
  ['section', 'Sections'],
  ['document', 'Whole document'],
];
function encode(f: Filters) {
  if (f.type !== 'all') return `type:${f.type}`;
  if (f.scope !== 'all') return `scope:${f.scope}`;
  return `preset:${f.preset}`;
}
function decode(v: string): Filters {
  const [kind, value] = v.split(/:(.*)/s);
  const base: Filters = { preset: 'Everything', type: 'all', scope: 'all' };
  if (kind === 'type') return { ...base, type: value as Filters['type'] };
  if (kind === 'scope') return { ...base, scope: value as Filters['scope'] };
  return { ...base, preset: value as Filters['preset'] };
}
/** One control covers size, type, and scope so there is a single decision to make. */
export function FilterControls({
  value,
  onChange,
  label = 'Filter annotations',
  id,
  pdf = false,
}: {
  value: Filters;
  onChange: (value: Filters) => void;
  label?: string;
  id?: string;
  pdf?: boolean;
}) {
  return (
    <select
      id={id}
      className="filter-select"
      aria-label={label}
      value={encode(value)}
      onChange={(e) => onChange(decode(e.target.value))}
    >
      <option value="preset:Everything">All annotations</option>
      <optgroup label="Size">
        <option value="preset:Small edits">Small edits</option>
        <option value="preset:Larger changes">Larger changes</option>
      </optgroup>
      <optgroup label="Type">
        {ACTIONS.map((x) => (
          <option key={x} value={`type:${x}`}>
            {x}
          </option>
        ))}
      </optgroup>
      <optgroup label="Scope">
        {SCOPES.filter(([v]) => !pdf || v !== 'section').map(([v, l]) => (
          <option key={v} value={`scope:${v}`}>
            {pdf && v === 'paragraph' ? 'Pages' : pdf && v === 'selection' ? 'Text and area selections' : l}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
