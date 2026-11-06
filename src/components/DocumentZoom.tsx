import { ZoomIn } from 'lucide-react';
import { ZOOM_LEVELS } from '../core/layout';
export function DocumentZoom({
  value,
  onChange,
  pdf = false,
}: {
  value: number | 'fit';
  onChange: (value: number | 'fit') => void;
  pdf?: boolean;
}) {
  return (
    <label className="document-zoom" title="Document zoom">
      <ZoomIn size={17} aria-hidden="true" />
      <select
        aria-label="Document zoom"
        value={value}
        onChange={(e) => onChange(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
      >
        {pdf && <option value="fit">Fit width</option>}
        {(pdf ? [75, 100, 125, 150, 200] : ZOOM_LEVELS).map((n) => (
          <option key={n} value={n}>
            {n}%
          </option>
        ))}
      </select>
    </label>
  );
}
