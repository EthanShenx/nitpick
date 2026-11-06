# LaTeX spike: selectable HTML and exact source anchors

**Recommendation: continue with the conservative AST renderer.** The fixtures confirm exact source coordinates for the supported HTML text model. Broader TeX compatibility should be added behind explicit fixtures, retaining placeholders for uncertain constructs.

## Method

The spike was implemented before the app UI. unified-latex parses each file independently, retaining original UTF-16 positions. Each displayed text run records its source filename and exclusive start/end offsets. Ordinary text has a linear mapping; math, citation labels, footnotes, macro expansions, images, and unknown constructs map atomically to their entire source invocation. DOM selections resolve via positioned leaf spans and normalize to the same immutable document offsets used in tests. No phrase matching or PDF extraction participates in anchoring.

The sample covers sections, repeated phrases, Chinese, citations, full footnotes, list items, a table, a figure/image, inline and display math, custom macros, input files, TikZ, and an unknown macro. `npm run spike` asserts retained content and exact mapping. Unit regressions test individual run slices and included-file attribution.

## Results

| Case | Result |
| --- | --- |
| Repeated phrases | Distinct normalized and source offsets; second occurrence retains its own paragraph/location |
| Unicode/Chinese | Preserved in the reading model and source slices |
| Text beside math | Ordinary text retains exact independent coordinates |
| Inline/display math | KaTeX HTML, one atomic source-backed selection unit |
| Custom macros | Simple required-argument expansions display; the anchor points to the invocation, including its braces |
| Included text | Uses the included file's coordinates, including multiple source ranges for selections spanning files |
| Sections, emphasis | Semantic HTML and paragraph/section locations |
| Citations, footnotes | Visible keys and full footnote text, with exact invocation anchors |
| Lists | All item text and styling retained; visual QA caught an AST item-body attachment that was fixed and added to the spike/unit tests |
| Tables | Content retained in simplified aligned rows/columns; complex table geometry is not reproduced |
| Figures | Referenced browser-readable image shown with caption, retained in portable project |
| TikZ/unknown commands | Explicit labeled placeholders, selectable as one unit, with full source retained |
| Missing/circular input | Explicit selectable placeholder and notice |

Real-browser checking selected the rendered `E=mc²` formula from the ZIP and exported the exact source `$E=mc^2$` at `paper/main.tex:465–473`, exclusive UTF-16 offsets.

## Limits

HTML layout is styled like a paper but cannot promise TeX pagination or package-level semantics. This renderer deliberately does not execute TeX. Complex macros, TikZ, custom environments, unavailable images, and other uncertain content remain labeled rather than guessed or dropped. KaTeX failures also remain labeled and source-backed. Basic citation keys are shown rather than pretending a bibliography has been compiled.

Source mapping remains reliable within these boundaries because it follows original AST positions and atomic invocation ranges. Display fidelity outside those boundaries is explicitly limited. New renderers or macro rules should not infer source ranges from repeated displayed strings.
