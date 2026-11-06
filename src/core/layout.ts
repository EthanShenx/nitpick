export interface ColumnWidths {
  outline: number;
  annotations: number;
}
export const COLUMN_LIMITS = {
  outline: { min: 150, max: 480 },
  annotations: { min: 240, max: 640 },
};
export const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200];
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function defaultColumns(width: number): ColumnWidths {
  return width > 1150 ? { outline: 240, annotations: 360 } : { outline: 200, annotations: 320 };
}
export function fitColumns(width: number, saved?: ColumnWidths, sidebar = true): ColumnWidths {
  const values = saved ?? defaultColumns(width);
  let outline = clamp(values.outline, 150, 480),
    annotations = clamp(values.annotations, 240, 640);
  if (width <= 950)
    return { outline, annotations: clamp(annotations, 240, Math.max(240, width - 280)) };
  const available = Math.max(sidebar ? 390 : 150, width - 320);
  const excess = Math.max(0, outline + (sidebar ? annotations : 0) - available);
  if (excess) {
    const spare = outline - 150 + (sidebar ? annotations - 240 : 0);
    outline -= spare ? (excess * (outline - 150)) / spare : 0;
    if (sidebar) annotations -= spare ? (excess * (annotations - 240)) / spare : 0;
  }
  return { outline: Math.round(outline), annotations: Math.round(annotations) };
}
export function resizeColumn(
  side: keyof ColumnWidths,
  value: number,
  width: number,
  current: ColumnWidths,
  sidebar = true,
): ColumnWidths {
  const min = COLUMN_LIMITS[side].min;
  const maximum =
    side === 'outline'
      ? Math.min(480, width - 320 - (sidebar ? current.annotations : 0))
      : Math.min(640, width - (width > 950 ? 320 + current.outline : 280));
  return { ...current, [side]: Math.round(clamp(value, min, Math.max(min, maximum))) };
}
