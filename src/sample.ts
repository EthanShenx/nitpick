import { parseMarkdown } from './core/markdown';
import { anchorAt } from './core/model';
import { newProject } from './core/types';
export const sampleText = `# The art of paying attention

## An invitation to slow down

We live in a world that rewards speed. We skim, we scroll, we move on. But some ideas only reveal themselves when we stay a little longer.

It is worth noting that careful reading is an act of curiosity. It asks us to notice what a sentence does, not just what it says. A pause can turn a familiar phrase into a new question.

Attention is not a resource we simply spend. It is a practice we can develop. The more closely we read, the more clearly we begin to see.

## The space between sentences

A good essay gives its reader room to think. It does not explain every connection or fill every silence. It trusts the reader to bring something of their own.

Writers often utilize a wide range of strategies to make their arguments more persuasive. Yet the strongest revisions are often the smallest: a sharper verb, a specific example, a sentence removed.

A recent survey found that readers remember twice as much when they read on paper. This claim sounds convincing, but it deserves a closer look before we build an argument around it.

## A more deliberate kind of revision

Revision begins with noticing. Before we reach for a better word, we need to understand what we want the sentence to do.

Read once for meaning. Read again for rhythm. Then leave clear, specific notes for the person who will make the changes — even if that person is your future self.

Keep what works. Question what doesn't. Make every change count.

慢下来，仔细阅读。好的修改，始于认真留意。
`;
export function sampleProject() {
  const p = newProject(parseMarkdown(sampleText, 'The art of paying attention.md'));
  for (const [type, quote, replacement, note] of [
    ['Delete', 'It is worth noting that ', '', 'Get straight to the point.'],
    ['Replace', 'utilize a wide range of strategies', 'use different strategies', ''],
    [
      'Verify',
      'readers remember twice as much when they read on paper',
      '',
      'Find a source; if none exists, flag it.',
    ],
    [
      'Keep',
      "Keep what works. Question what doesn't. Make every change count.",
      '',
      'A strong closing rhythm.',
    ],
  ] as const) {
    const start = p.doc.text.indexOf(quote);
    p.annotations.push({
      id: `E${p.annotations.length + 1}`,
      type,
      scope: 'selection',
      anchor: anchorAt(p.doc, start, start + quote.length),
      replacement,
      note,
      placement: 'after',
      createdAt: Date.now() + p.annotations.length,
    });
  }
  return p;
}
