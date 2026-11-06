import type { ColumnWidths } from './layout';
import { ensureGlobalSuggestions } from './review';
export const ACTIONS = [
  'Delete',
  'Replace',
  'Insert',
  'Move',
  'Comment',
  'Keep',
  'Verify',
] as const;
export type Action = (typeof ACTIONS)[number];
export type Scope = 'selection' | 'paragraph' | 'section' | 'document';
export interface SourceRange {
  file: string;
  start: number;
  end: number;
}
export interface Run {
  text: string;
  start: number;
  end: number;
  source?: SourceRange;
  atomic?: boolean;
  kind?: 'math' | 'placeholder' | 'image';
  math?: string;
  display?: boolean;
  image?: string;
  style?: 'strong' | 'emphasis' | 'code' | 'footnote' | 'deleted' | 'inserted';
}
export interface Block {
  id: string;
  kind: 'paragraph' | 'heading' | 'title' | 'list' | 'table' | 'figure';
  listMarker?: string;
  level?: number;
  runs: Run[];
  start: number;
  end: number;
  section: number;
  heading: string;
  paragraph: number;
}
export interface PdfRect { page: number; x: number; y: number; width: number; height: number }
export interface PdfItem { index: number; start: number; end: number; rect: PdfRect }
export interface PdfPage {
  number: number; label: string; width: number; height: number; rotation: number;
  transform: number[]; start: number; end: number; items: PdfItem[];
}
export interface PdfBookmark { title: string; page: number; children: PdfBookmark[] }
export interface Doc {
  original?: { name: string; data: string; encoding: 'base64' };
  name: string;
  format: 'md' | 'tex' | 'docx' | 'pdf' | 'html';
  pdf?: { pages: PdfPage[]; outline: PdfBookmark[] };
  main: string;
  files: Record<string, string>;
  assets: Record<string, string>;
  blocks: Block[];
  text: string;
  warnings: string[];
}
export interface Anchor {
  pdfRects?: PdfRect[];
  region?: boolean;
  start: number;
  end: number;
  quote: string;
  before: string;
  after: string;
  section: number;
  sectionEnd: number;
  heading: string;
  paragraph: number;
  paragraphEnd: number;
  source: SourceRange[];
}
export interface Annotation {
  id: string;
  type: Action;
  scope: Scope;
  anchor: Anchor;
  note: string;
  replacement: string;
  placement: 'before' | 'after';
  destination?: Anchor;
  destinationUncertain?: boolean;
  localAnchor?: Anchor;
  createdAt: number;
}
export interface Filters {
  preset: 'Everything' | 'Small edits' | 'Larger changes';
  type: Action | 'all';
  scope: Scope | 'all';
}
export interface ExportSettings {
  audience: 'ai' | 'people';
  layout: 'list' | 'inline';
  format: 'md' | 'json' | 'docx' | 'html' | 'pdf';
  instructions: string;
  filters: Filters;
}
export interface Project {
  sourcePath?: string;
  projectFileName?: string;
  defaultSuggestionsVersion?: number;
  editingId?: string;
  readingOffset?: number;
  pdfZoom?: number | 'fit';
  readerZoom?: number;
  columnWidths?: ColumnWidths;
  format: 'nitpick';
  version: 1 | 2 | 3;
  id: string;
  title: string;
  doc: Doc;
  annotations: Annotation[];
  notes: string[];
  filters: Filters;
  exportSettings: ExportSettings;
  scroll: number;
  updatedAt: number;
  revision: number;
  fileRevision: number | null;
}
export const defaultFilters: Filters = { preset: 'Everything', type: 'all', scope: 'all' };
export const defaultInstructions =
  "Apply only the revisions listed below. Preserve the author's voice and leave all other text unchanged. Respect Keep notes. Never invent facts or sources. Flag conflicting or ambiguous instructions instead of guessing. Unfinished annotations are requests for review, not permission to improvise.";
export function newProject(doc: Doc, options: { defaultSuggestions?: boolean } = {}): Project {
  const project: Project = {
    sourcePath: doc.main,
    format: 'nitpick',
    version: doc.format === 'html' ? 3 : doc.format === 'pdf' ? 2 : 1,
    id: crypto.randomUUID(),
    title: doc.name.replace(/\.(md|tex|docx|zip|pdf|html?)$/i, ''),
    doc,
    annotations: [],
    notes: ['Too wordy', 'Get straight to the point', 'Find a source; if none exists, flag it.'],
    filters: { ...defaultFilters },
    exportSettings: {
      audience: 'ai',
      layout: 'list',
      format: 'md',
      instructions: defaultInstructions,
      filters: { ...defaultFilters },
    },
    scroll: 0,
    updatedAt: Date.now(),
    revision: 0,
    fileRevision: null,
  };
  return options.defaultSuggestions === false ? project : ensureGlobalSuggestions(project);
}
