import type { Annotation, Project, Scope } from './types';
import { anchorAt, blockAnchor } from './model';
export const GLOBAL_SUGGESTIONS = [
  'Avoid unnecessary, formulaic, or artificial transitions and rhetorical contrasts, especially constructions such as "X is Y. It...", "X is Y: it...", "rather than", "It is X, not Y". Do not use these patterns merely to create emphasis or an appearance of logical progression. Express ideas directly and naturally, allowing connections to emerge from their meaning and context. Use transitions only when they clarify a genuine relationship between ideas.',
  'Do not use colons (:) or semicolons (;) in prose. Instead, connect related ideas with appropriate conjunctions, transitional words, or complete sentences. Choose sentence structures that make logical relationships clear and preserve a natural flow. When ideas are sufficiently distinct, begin a new sentence rather than forcing them together.',
] as const;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
export function wordCount(text: string): number {
  return [...segmenter.segment(text)].filter((s) => s.isWordLike).length;
}
export function ensureGlobalSuggestions(p: Project): Project {
  if (p.defaultSuggestionsVersion === 1) return p;
  const additions = GLOBAL_SUGGESTIONS.filter(
    (note) => !p.annotations.some((a) => a.scope === 'document' && a.note === note),
  ).map((note): Annotation => ({
    id: 'D' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    type: 'Comment',
    scope: 'document',
    anchor: anchorAt(p.doc, 0, 0),
    note,
    replacement: '',
    placement: 'after',
    createdAt: Date.now(),
  }));
  return {
    ...p,
    defaultSuggestionsVersion: 1,
    annotations: [...p.annotations, ...additions],
    revision: p.revision + 1,
  };
}
export function emptyTextAnnotation(a: Annotation): boolean {
  return (
    ['Comment', 'Replace', 'Insert'].includes(a.type) && !a.note.trim() && !a.replacement.trim()
  );
}
export function annotationScope(p: Project, a: Annotation, scope: Scope): Annotation {
  if (scope === a.scope) return a;
  const local = a.localAnchor ?? a.anchor;
  if (scope === 'document')
    return { ...a, scope, localAnchor: local, anchor: anchorAt(p.doc, 0, 0) };
  const block =
    p.doc.blocks.find((b) => b.start <= local.start && b.end > local.start) ?? p.doc.blocks[0];
  return {
    ...a,
    scope,
    anchor: scope === 'selection' ? local : blockAnchor(p.doc, block, scope === 'section'),
  };
}
