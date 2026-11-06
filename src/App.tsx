import { lazy, Suspense } from 'react';
const PdfReader = lazy(() => import('./components/PdfReader'));
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  Pencil,
  Save,
  ChevronDown,
  ChevronRight,
  Undo2,
  Redo2,
  X,
  Trash2,
  Replace,
  Plus,
  MoveRight,
  MessageSquare,
  ShieldCheck,
  BadgeHelp,
  Keyboard,
  Info,
  Menu,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import type { Action, Annotation, Anchor, Block, Project, Scope } from './core/types';
import { newProject } from './core/types';
import { anchorAt, blockAnchor } from './core/model';
import {
  getHandle,
  deleteLocalProject,
  restoreLocalProject,
  saveHandle,
  saveLocal,
  recentProjects,
  parseProject,
  download,
} from './core/storage';
import {
  importDocument,
  importLatexFolder,
  MainFileChoice,
  LatexProjectRequired,
} from './core/import';
import { savePortable, PortableWriteQueue } from './core/portable';
import { readSelection } from './core/selection';
import { Home, Brand } from './components/Home';
import { OverlapPicker } from './components/OverlapPicker';
import type { OverlapTarget } from './components/OverlapPicker';
import type { SidebarTab } from './components/Sidebar';
import { overlappingAnnotations } from './core/overlap';
import { matches } from './core/model';
import { Paper } from './components/Paper';
import { DocumentSearch } from './components/DocumentSearch';
import { DocumentZoom } from './components/DocumentZoom';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { FloatingToolbar } from './components/SelectionToolbar';
import { DocumentOutline } from './components/DocumentOutline';
import { Sidebar } from './components/Sidebar';
import { Composer } from './components/Composer';
import type { Draft, DraftValues } from './components/Composer';
import { Modal } from './components/Modal';
import { ExportDialog } from './components/ExportDialog';
import {
  ensureGlobalSuggestions,
  annotationScope,
  emptyTextAnnotation,
  wordCount,
} from './core/review';
import { sampleProject } from './sample';
const tools = [
  { type: 'Delete', key: 'D', icon: Trash2 },
  { type: 'Replace', key: 'R', icon: Replace },
  { type: 'Insert', key: 'I', icon: Plus },
  { type: 'Move', key: 'M', icon: MoveRight },
  { type: 'Comment', key: 'C', icon: MessageSquare },
  { type: 'Keep', key: 'K', icon: ShieldCheck },
  { type: 'Verify', key: 'V', icon: BadgeHelp },
] as const;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const CAN_PICK_FILE = typeof (window as any).showSaveFilePicker === 'function';
export default function App() {
  const [project, setProject] = useState<Project | null>(null),
    [recent, setRecent] = useState<Project[]>([]),
    [removed, setRemoved] = useState<Project | null>(null),
    [savePrompt, setSavePrompt] = useState(false),
    [fileReady, setFileReady] = useState(false),
    [fileSaving, setFileSaving] = useState(false),
    [manualSaving, setManualSaving] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [browserSaved, setBrowserSaved] = useState(true),
    [active, setActive] = useState<string | null>(null),
    [selection, setSelection] = useState<{ anchor: Anchor; rect: { x: number; y: number } } | null>(
      null,
    ),
    [overlap, setOverlap] = useState<OverlapTarget | null>(null),
    [highlight, setHighlight] = useState<{ id: string; x: number; y: number } | null>(null),
    [sidebarTab, setSidebarTab] = useState<SidebarTab>('Annotations'),
    [draft, setDraft] = useState<Draft | null>(null),
    [exporting, setExporting] = useState(false),
    [saveMenu, setSaveMenu] = useState(false),
    [help, setHelp] = useState(false),
    [warnings, setWarnings] = useState(false),
    [sources, setSources] = useState(false),
    [mainChoice, setMainChoice] = useState<MainFileChoice | null>(null),
    [projectRequired, setProjectRequired] = useState<LatexProjectRequired | null>(null),
    [moving, setMoving] = useState<string | null>(null),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 700),
    [outline, setOutline] = useState(false),
    [history, setHistory] = useState<{ past: Annotation[][]; future: Annotation[][] }>({
      past: [],
      future: [],
    });
  const manualSavingRef = useRef(false);
  const fileQueue = useRef(new PortableWriteQueue());
  const fileTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileSequence = useRef(0);
  const input = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    reader = useRef<HTMLDivElement>(null),
    paper = useRef<HTMLDivElement>(null),
    handle = useRef<any>(null),
    composing = useRef(false),
    current = useRef(project),
    scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  current.current = project;
  const closeOverlap = useCallback(() => setOverlap(null), []);
  const closeHighlight = useCallback(() => setHighlight(null), []);
  const [startup, setStartup] = useState(true);
  useEffect(() => {
    recentProjects()
      .then((items) => {
        setRecent(items);
        const id = localStorage.getItem('nitpick-active');
        const saved = items.find((p) => p.id === id);
        if (saved) {
          setProject(ensureGlobalSuggestions(saved));
          getHandle(saved.id)
            .then(async (h) => {
              handle.current = h;
              const allowed =
                h &&
                (!h.queryPermission ||
                  (await h.queryPermission({ mode: 'readwrite' })) === 'granted');
              setFileReady(!!allowed);
              setSavePrompt(!!h && !allowed);
            })
            .catch(() => {});
        }
      })
      .catch(() =>
        setError('Browser storage is unavailable. Use Save to keep your work in a file.'),
      )
      .finally(() => setStartup(false));
  }, []);
  useEffect(() => {
    if (!project) return;
    setBrowserSaved(false);
    let cancelled = false;
    saveLocal(project)
      .then(() => {
        if (!cancelled) setBrowserSaved(true);
      })
      .catch(() => setError('Autosave failed. Use Save to keep your work in a file.'));
    return () => {
      cancelled = true;
    };
  }, [project]);
  const change = useCallback(
    (fn: (p: Project) => Project) =>
      setProject((p) => (p ? { ...fn(p), updatedAt: Date.now(), revision: p.revision + 1 } : p)),
    [],
  );
  const commit = useCallback(
    (fn: (a: Annotation[]) => Annotation[]) => {
      const p = current.current;
      if (!p) return;
      setHistory((h) => ({ past: [...h.past, p.annotations].slice(-100), future: [] }));
      change((x) => ({ ...x, annotations: fn(x.annotations) }));
    },
    [change],
  );
  const removeAnnotation = useCallback(
    (id: string) => {
      const p = current.current;
      if (!p?.annotations.some((a) => a.id === id)) return;
      commit((items) => items.filter((a) => a.id !== id));
      if (p.editingId === id) change((p) => ({ ...p, editingId: undefined }));
      setActive(null);
      setHighlight(null);
      setOverlap(null);
      setDraft((draft) => (draft?.editing?.id === id ? null : draft));
      setSelection(null);
      setMoving((moving) => (moving === id ? null : moving));
      window.getSelection()?.removeAllRanges();
    },
    [commit, change],
  );
  const writeToFile = useCallback(async (p: Project, h: any) => {
    const sequence = ++fileSequence.current;
    setFileSaving(true);
    try {
      const saved = await fileQueue.current.write(p, h);
      if (handle.current === h)
        setProject((curr) =>
          curr?.id === saved.id ? { ...curr, fileRevision: saved.revision } : curr,
        );
      return true;
    } catch (e) {
      if (handle.current === h && current.current?.id === p.id) {
        setFileReady(false);
        setSavePrompt(true);
        setError(
          `File autosave stopped. Your work is saved in the browser. ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      return false;
    } finally {
      if (sequence === fileSequence.current) setFileSaving(false);
    }
  }, []);
  const openProject = useCallback(
    async (inputProject: Project, fromImport = false, askForFile = false) => {
      clearTimeout(scrollTimer.current);
      clearTimeout(fileTimer.current);
      if (
        current.current &&
        handle.current &&
        current.current.fileRevision !== current.current.revision &&
        (!handle.current.queryPermission ||
          (await handle.current.queryPermission({ mode: 'readwrite' })) === 'granted')
      )
        await writeToFile(current.current, handle.current);
      handle.current = null;
      setFileReady(false);
      const p = ensureGlobalSuggestions(inputProject);
      try {
        if (!fromImport) handle.current = await getHandle(p.id);
      } catch {
        /* local storage remains available */
      }
      const h = handle.current;
      const allowed =
        h && (!h.queryPermission || (await h.queryPermission({ mode: 'readwrite' })) === 'granted');
      localStorage.setItem('nitpick-active', p.id);
      setProject(p);
      setFileReady(!!allowed);
      setSavePrompt(h ? !allowed : askForFile);
      setRemoved(null);
      setHistory({ past: [], future: [] });
      setSelection(null);
      setDraft(null);
      setActive(null);
      setOverlap(null);
      setHighlight(null);
      setSidebarTab('Annotations');
      setMoving(null);
      setOutline(false);
      setWarnings(false);
    },
    [writeToFile],
  );
  useEffect(() => {
    clearTimeout(fileTimer.current);
    if (!project || !fileReady || !handle.current || project.fileRevision === project.revision)
      return;
    const p = project,
      h = handle.current;
    fileTimer.current = setTimeout(() => {
      void writeToFile(p, h);
    }, 350);
    return () => clearTimeout(fileTimer.current);
  }, [project, fileReady, writeToFile]);
  useEffect(() => {
    if (!project || !reader.current || !paper.current) return;
    const container = reader.current;
    const content = paper.current;
    let interacted = false;
    const restore = () => {
      if (interacted) return;
      if (project.readingOffset !== undefined && !project.doc.pdf) {
        const leaf = [...content.querySelectorAll<HTMLElement>('[data-leaf]')].find(
          (e) =>
            Number(e.dataset.start) <= project.readingOffset! &&
            Number(e.dataset.end) > project.readingOffset!,
        );
        if (leaf) {
          let top = leaf.getBoundingClientRect().top;
          if (leaf.dataset.atomic !== 'true' && leaf.firstChild?.nodeType === Node.TEXT_NODE) {
            const r = document.createRange();
            r.setStart(leaf.firstChild, project.readingOffset - Number(leaf.dataset.start));
            r.setEnd(
              leaf.firstChild,
              Math.min(
                (leaf.firstChild.textContent ?? '').length,
                project.readingOffset - Number(leaf.dataset.start) + 1,
              ),
            );
            top = r.getBoundingClientRect().top;
          }
          container.scrollTop += top - container.getBoundingClientRect().top - 20;
          return;
        }
      }
      container.scrollTop = project.scroll;
    };
    const stop = () => {
      interacted = true;
    };
    const frame = requestAnimationFrame(restore);
    const resize = new ResizeObserver(restore);
    resize.observe(content);
    content.addEventListener('load', restore, true);
    for (const name of ['wheel', 'pointerdown', 'keydown'])
      container.addEventListener(name, stop, { passive: true });
    const timer = setTimeout(() => {
      resize.disconnect();
      content.removeEventListener('load', restore, true);
    }, 3000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      content.removeEventListener('load', restore, true);
      for (const name of ['wheel', 'pointerdown', 'keydown'])
        container.removeEventListener(name, stop);
    };
  }, [project?.id]);
  const save = useCallback(
    async (as = false, copy = false) => {
      const original = current.current;
      if (!original) return false;
      if (manualSavingRef.current) return false;
      manualSavingRef.current = true;
      setManualSaving(true);
      clearTimeout(fileTimer.current);
      setSaveMenu(false);
      const oldHandle = handle.current,
        oldReady = fileReady;
      if (!copy) setFileReady(false);
      try {
        let h = as || copy ? null : oldHandle;
        const picker = (window as any).showSaveFilePicker?.bind(window);
        if (!h && !copy && picker)
          h = await picker({
            suggestedName: original.projectFileName || `${original.title}.nitpick`,
            types: [
              { description: 'Nitpick project', accept: { 'application/json': ['.nitpick'] } },
            ],
          });
        if (
          h?.requestPermission &&
          (await h.requestPermission({ mode: 'readwrite' })) !== 'granted'
        )
          throw new Error('File access was not granted.');
        const currentProject = current.current;
        if (!currentProject || currentProject.id !== original.id) return false;
        const name = h?.name || currentProject.projectFileName || `${currentProject.title}.nitpick`;
        const snapshot = { ...currentProject, projectFileName: name };
        if (h) {
          await fileQueue.current.write(snapshot, h);
          handle.current = h;
          await saveHandle(snapshot.id, h).catch(() => {});
          setFileReady(true);
        } else {
          await savePortable(snapshot, { download });
          if (!copy) {
            handle.current = null;
            setFileReady(false);
          }
        }
        if (!copy || !oldHandle)
          setProject((curr) =>
            curr?.id === snapshot.id
              ? { ...curr, projectFileName: name, fileRevision: snapshot.revision }
              : curr,
          );
        setSavePrompt(false);
        setError('');
        return true;
      } catch (e) {
        if (!copy) {
          handle.current = oldHandle;
          setFileReady(oldReady);
        }
        if (!(e instanceof DOMException && e.name === 'AbortError'))
          setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        manualSavingRef.current = false;
        setManualSaving(false);
      }
    },
    [fileReady],
  );
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const p = current.current;
      if (manualSavingRef.current || (p && p.fileRevision !== p.revision)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  const doUndo = useCallback(
    (redo = false) => {
      const p = current.current;
      if (!p) return;
      setHistory((h) => {
        const items = redo ? h.future : h.past;
        if (!items.length) return h;
        const next = items.at(-1)!;
        change((x) => ({ ...x, annotations: next, editingId: undefined }));
        return redo
          ? { past: [...h.past, p.annotations], future: h.future.slice(0, -1) }
          : { past: h.past.slice(0, -1), future: [...h.future, p.annotations] };
      });
      setDraft(null);
      setSelection(null);
      setMoving(null);
      setHighlight(null);
      setOverlap(null);
    },
    [change],
  );
  const annotate = useCallback(
    (type: Action) => {
      const p = current.current;
      if (!p || !selection) return;
      setSidebar(true);
      setSidebarTab('Annotations');
      setOverlap(null);
      setHighlight(null);
      if (['Delete', 'Keep', 'Verify'].includes(type)) {
        const id = 'E' + crypto.randomUUID().slice(0, 8).toUpperCase();
        commit((items) => [
          ...items,
          {
            id,
            type,
            scope: 'selection',
            anchor: selection.anchor,
            note: '',
            replacement: '',
            placement: 'after',
            createdAt: Date.now(),
          },
        ]);
        setActive(id);
        setSelection(null);
        window.getSelection()?.removeAllRanges();
        if (type === 'Move') setMoving(id);
      } else {
        const a: Annotation = {
          id: 'E' + crypto.randomUUID().slice(0, 8).toUpperCase(),
          type,
          scope: 'selection',
          anchor: selection.anchor,
          note: '',
          replacement: '',
          placement: 'after',
          createdAt: Date.now(),
        };
        commit((items) => [...items, a]);
        change((p) => ({ ...p, editingId: a.id }));
        setDraft({
          type,
          scope: 'selection',
          anchor: selection.anchor,
          rect: selection.rect,
          editing: a,
          created: true,
        });
        setSelection(null);
      }
    },
    [selection, commit, change],
  );
  const removeSelectedHighlights = useCallback(() => {
    const p = current.current;
    if (!p || !selection) return;
    const notes = overlappingAnnotations(selection.anchor, p.annotations).filter((a) =>
      matches(a, p.filters),
    );
    if (notes.length === 1) removeAnnotation(notes[0].id);
    else if (notes.length > 1) {
      setOverlap({ ids: notes.map((a) => a.id), x: selection.rect.x, y: selection.rect.y });
      setHighlight(null);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [selection, removeAnnotation]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.isComposing || composing.current || e.keyCode === 229) return;
      const editable = (e.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable="true"]',
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(true);
        return;
      }
      if (
        editable ||
        exporting ||
        help ||
        mainChoice ||
        projectRequired ||
        draft ||
        overlap ||
        savePrompt
      )
        return;
      if (e.key === 'Escape') {
        setHighlight(null);
        setSelection(null);
        setMoving(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo(e.shiftKey);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doUndo(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const leaf = (e.target as HTMLElement).closest<HTMLElement>('[data-annotation-ids]');
        if (selection) {
          e.preventDefault();
          removeSelectedHighlights();
        } else if (leaf && window.getSelection()?.isCollapsed) {
          e.preventDefault();
          const ids = leaf.dataset.annotationIds!.split(' ');
          if (ids.length === 1) removeAnnotation(ids[0]);
          else {
            const rect = leaf.getBoundingClientRect();
            setHighlight(null);
            setOverlap({ ids, x: rect.left + rect.width / 2, y: rect.bottom });
          }
        } else if (highlight && (e.target as HTMLElement).closest('.highlight-actions')) {
          e.preventDefault();
          removeAnnotation(highlight.id);
        }
        return;
      }
      const tool = tools.find((t) => t.key === e.key.toUpperCase());
      if (tool && selection) {
        e.preventDefault();
        annotate(tool.type);
      }
    }
    const start = () => {
        composing.current = true;
      },
      end = () => {
        composing.current = false;
      };
    document.addEventListener('keydown', key);
    document.addEventListener('compositionstart', start, true);
    document.addEventListener('compositionend', end, true);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('compositionstart', start, true);
      document.removeEventListener('compositionend', end, true);
    };
  }, [
    selection,
    annotate,
    save,
    doUndo,
    exporting,
    help,
    mainChoice,
    projectRequired,
    draft,
    overlap,
    highlight,
    removeAnnotation,
    removeSelectedHighlights,
    savePrompt,
  ]);
  const importFile = async (file: File, allowMissingInputs = false) => {
    setBusy('Opening document…');
    setError('');
    try {
      if (file.name.toLowerCase().endsWith('.nitpick')) {
        const imported = parseProject(await file.text());
        imported.projectFileName = file.name;
        await openProject(imported, true, true);
      } else
        await openProject(
          newProject(await importDocument(file, undefined, allowMissingInputs)),
          false,
          true,
        );
    } catch (e) {
      if (e instanceof MainFileChoice) setMainChoice(e);
      else if (e instanceof LatexProjectRequired) setProjectRequired(e);
      else
        setError(
          e instanceof Error
            ? e.message
            : 'This file could not be read. Your existing work is safe.',
        );
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  };
  const importFolder = async (files: File[]) => {
    setBusy('Opening LaTeX project…');
    setError('');
    try {
      const doc = await importLatexFolder(files);
      await openProject(newProject(doc), false, true);
      setProjectRequired(null);
    } catch (e) {
      if (e instanceof MainFileChoice) {
        setProjectRequired(null);
        setMainChoice(e);
      } else
        setError(
          e instanceof Error ? e.message : 'This folder could not be read. Existing work is safe.',
        );
    } finally {
      setBusy('');
      if (folderInput.current) folderInput.current.value = '';
    }
  };
  const goHome = async () => {
    if (manualSavingRef.current) return;
    setOverlap(null);
    setHighlight(null);
    clearTimeout(scrollTimer.current);
    clearTimeout(fileTimer.current);
    setDraft(null);
    setSelection(null);
    setMoving(null);
    if (current.current) {
      let p = current.current;
      const editing = p.annotations.find((a) => a.id === p.editingId);
      if (
        editing &&
        (emptyTextAnnotation(editing) ||
          (draft?.created &&
            !editing.note.trim() &&
            !editing.replacement.trim() &&
            !editing.destination))
      )
        p = {
          ...p,
          annotations: p.annotations.filter((a) => a.id !== editing.id),
          editingId: undefined,
          revision: p.revision + 1,
        };
      await saveLocal(p).catch(() => {});
      if (fileReady && handle.current && p.fileRevision !== p.revision)
        await writeToFile(p, handle.current);
    }
    localStorage.removeItem('nitpick-active');
    setProject(null);
    setSavePrompt(false);
    setFileReady(false);
    setRecent(await recentProjects().catch(() => recent));
  };
  const jump = (a: Annotation) => {
    setOverlap(null);
    setHighlight(null);
    setSelection(null);
    setSidebar(true);
    setSidebarTab(a.scope === 'document' ? 'Whole document' : 'Annotations');
    if (project && !matches(a, project.filters))
      change((p) => ({ ...p, filters: { preset: 'Everything', type: 'all', scope: 'all' } }));
    setActive(a.id);
    if (a.scope === 'document') {
      reader.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const b = project!.doc.blocks.find(
        (b) => b.start <= a.anchor.start && b.end >= a.anchor.start,
      );
      if (b) document.getElementById(b.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(
      () =>
        document
          .querySelector(`[data-annotation="${a.id}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      10,
    );
  };
  const capture = () => {
    if (!paper.current || !project || draft) return;
    const selected = readSelection(paper.current, project.doc);
    setSelection(selected);
    if (selected) {
      setOverlap(null);
      setHighlight(null);
    }
  };
  const abandonedDraftId = () => {
    const a = current.current?.annotations.find((a) => a.id === draft?.editing?.id);
    return a &&
      (emptyTextAnnotation(a) ||
        (draft?.created && !a.note.trim() && !a.replacement.trim() && !a.destination))
      ? a.id
      : undefined;
  };
  const beginNote = (scope: Scope, anchor: Anchor) => {
    const prefix = scope === 'document' ? 'D' : scope === 'section' ? 'S' : 'P';
    const a: Annotation = {
      id: prefix + crypto.randomUUID().slice(0, 8).toUpperCase(),
      type: 'Comment',
      scope,
      anchor,
      note: '',
      replacement: '',
      placement: 'after',
      createdAt: Date.now(),
    };
    const abandoned = abandonedDraftId();
    commit((items) => [...items.filter((x) => x.id !== abandoned), a]);
    if (abandoned)
      setHistory((h) => ({
        past: h.past.map((items) => items.filter((x) => x.id !== abandoned)),
        future: [],
      }));
    change((p) => ({ ...p, editingId: a.id }));
    setSelection(null);
    setDraft({ type: 'Comment', scope, anchor, editing: a, created: true });
  };
  const scopeNote = (b: Block, scope: Scope) =>
    beginNote(scope, blockAnchor(project!.doc, b, scope === 'section'));
  const documentNote = () => {
    if (project) {
      setSidebar(true);
      setSidebarTab('Whole document');
      beginNote('document', anchorAt(project.doc, 0, 0));
    }
  };
  const draftAnnotation = (p: Project, a: Annotation, values: DraftValues): Annotation => {
    const scoped = annotationScope(p, a, values.scope);
    return {
      ...scoped,
      type: values.type,
      note: values.note,
      replacement: values.replacement,
      placement: values.placement,
      destinationUncertain: values.type === 'Move' && values.destinationMode === 'unsure',
      destination:
        values.type === 'Move' && values.destinationMode !== 'known' ? undefined : a.destination,
    };
  };
  const updateDraft = (values: DraftValues) => {
    if (!draft?.editing || !current.current) return;
    const a = current.current.annotations.find((a) => a.id === draft.editing!.id);
    if (!a) return;
    const updated = draftAnnotation(current.current, a, values);
    if (JSON.stringify(updated) === JSON.stringify(a)) return;
    change((p) => ({ ...p, annotations: p.annotations.map((x) => (x.id === a.id ? updated : x)) }));
  };
  const resolveDraft = (values?: DraftValues, finish = false) => {
    const p = current.current,
      id = draft?.editing?.id;
    const a = p?.annotations.find((a) => a.id === id);
    if (!p || !a) {
      setDraft(null);
      return;
    }
    const next = values ? draftAnnotation(p, a, values) : a;
    const discard =
      emptyTextAnnotation(next) ||
      (!finish &&
        draft?.created &&
        !next.note.trim() &&
        !next.replacement.trim() &&
        !next.destination);
    change((p) => ({
      ...p,
      editingId: undefined,
      annotations: discard
        ? p.annotations.filter((x) => x.id !== id)
        : p.annotations.map((x) => (x.id === id ? next : x)),
    }));
    if (discard && draft?.created)
      setHistory((h) => ({
        past: h.past.map((items) => items.filter((x) => x.id !== id)),
        future: [],
      }));
    setDraft(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    if (!discard) {
      setActive(next.id);
      setSidebarTab(next.scope === 'document' ? 'Whole document' : 'Annotations');
    }
    if (
      finish &&
      !discard &&
      next.type === 'Move' &&
      !next.destination &&
      !next.destinationUncertain
    )
      setMoving(next.id);
  };
  const closeDraft = (values?: DraftValues) => resolveDraft(values);
  useEffect(() => {
    const a = project?.annotations.find((a) => a.id === project.editingId);
    if (a) {
      if (a.scope === 'document') setSidebarTab('Whole document');
      setDraft({
        type: a.type,
        scope: a.scope,
        anchor: a.anchor,
        editing: a,
        created: !a.note.trim() && !a.replacement.trim() && !a.destination,
      });
    }
  }, [project?.id]);
  const finishDraft = (values: DraftValues) => resolveDraft(values, true);
  const editAnnotation = (a: Annotation, rect?: { x: number; y: number }) => {
    const p = current.current;
    if (!p) return;
    const abandoned = draft?.editing?.id !== a.id ? abandonedDraftId() : undefined;
    const annotations = p.annotations.filter((x) => x.id !== abandoned);
    setHistory((h) => ({
      past: [...h.past.map((items) => items.filter((x) => x.id !== abandoned)), annotations].slice(
        -100,
      ),
      future: [],
    }));
    change((p) => ({ ...p, annotations, editingId: a.id }));
    setSelection(null);
    setHighlight(null);
    setDraft({
      type: a.type,
      scope: a.scope,
      anchor: a.anchor,
      editing: a,
      rect,
      created: draft?.editing?.id === a.id ? draft.created : false,
    });
  };
  useEffect(() => {
    if (!active || draft) return;
    document
      .querySelector(`[data-annotation="${active}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active, project?.annotations.length, sidebarTab, !!draft]);
  const saveNote = (note: string) =>
    change((p) => ({ ...p, notes: [...new Set([...p.notes, note])] }));
  const selectionNotes =
    selection && project
      ? overlappingAnnotations(selection.anchor, project.annotations).filter((a) =>
          matches(a, project.filters),
        )
      : [];
  const overlapCount = selectionNotes.length;
  const selectedWordCount = selection ? wordCount(selection.anchor.quote) : 0;
  const highlightedNote = highlight && project?.annotations.find((a) => a.id === highlight.id);
  const status =
    project?.fileRevision === null
      ? 'Saved in browser'
      : project?.fileRevision === project?.revision
        ? 'Saved to file'
        : 'Unsaved changes to file';
  return (
    <>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Import document or project"
        accept=".html,.htm,.pdf,.md,.docx,.tex,.zip,.nitpick"
        onChange={(e) => {
          if (e.target.files?.[0]) void importFile(e.target.files[0]);
        }}
      />
      <input
        ref={folderInput}
        className="sr-only"
        type="file"
        aria-label="Import LaTeX project folder"
        multiple
        {...{ webkitdirectory: '' }}
        onChange={(e) => {
          if (e.target.files?.length) void importFolder(Array.from(e.target.files));
        }}
      />
      {project ? (
        <div className="workspace">
          <header className="workspace-header">
            <button
              className="icon-button tablet-outline"
              aria-label="Toggle document outline"
              aria-expanded={outline}
              onClick={() => setOutline(!outline)}
            >
              <Menu size={18} />
            </button>
            <Brand onClick={() => void goHome()} />
            <h1 className="header-title" title={project.title}>
              {project.title}
            </h1>
            <div className="header-tools">
              <button
                className="icon-button"
                aria-label="Undo annotation change"
                disabled={!history.past.length}
                onClick={() => doUndo()}
                title={`Undo (${MOD}Z)`}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo annotation change"
                disabled={!history.future.length}
                onClick={() => doUndo(true)}
                title={`Redo (${MOD}Shift+Z)`}
              >
                <Redo2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
                onClick={() => setHelp(true)}
              >
                <Keyboard size={18} />
              </button>
            </div>
            <DocumentZoom
              pdf={!!project.doc.pdf}
              value={
                project.doc.pdf
                  ? project.pdfZoom === undefined || project.pdfZoom === 'fit'
                    ? 'fit'
                    : project.pdfZoom * 100
                  : (project.readerZoom ?? 100)
              }
              onChange={(value) => {
                setSelection(null);
                setHighlight(null);
                window.getSelection()?.removeAllRanges();
                change((p) =>
                  p.doc.pdf
                    ? { ...p, pdfZoom: value === 'fit' ? 'fit' : value / 100 }
                    : { ...p, readerZoom: value === 'fit' ? 100 : value },
                );
              }}
            />
            <DocumentSearch
              key={project.id}
              doc={project.doc}
              reader={reader}
              paper={paper}
              disabled={
                !!(
                  draft ||
                  exporting ||
                  help ||
                  savePrompt ||
                  overlap ||
                  mainChoice ||
                  projectRequired
                )
              }
            />
            <div
              className={`save-status ${status === 'Unsaved changes to file' ? 'dirty' : ''}`}
              role="status"
              title={project.projectFileName}
            >
              {fileSaving || manualSaving
                ? 'Saving to file…'
                : browserSaved
                  ? status
                  : 'Saving in browser…'}
            </div>
            <div className="save-group">
              <button
                className={`button save-button ${CAN_PICK_FILE ? '' : 'standalone'}`}
                disabled={manualSaving}
                onClick={() => void save(true)}
              >
                <Save size={16} aria-hidden="true" />
                <span className="button-label">{CAN_PICK_FILE ? 'Save as…' : 'Download'}</span>
              </button>
              {CAN_PICK_FILE && (
                <button
                  className="button save-arrow"
                  aria-label="Save options"
                  aria-expanded={saveMenu}
                  onClick={() => setSaveMenu(!saveMenu)}
                >
                  <ChevronDown size={16} />
                </button>
              )}
              {saveMenu && (
                <div className="save-popover">
                  <button onClick={() => void save(false, true)}>Download a copy</button>
                </div>
              )}
            </div>
            <button className="button primary" onClick={() => setExporting(true)}>
              <Download size={16} aria-hidden="true" />
              <span className="button-label">Export</span>
            </button>
            <button
              className="icon-button"
              aria-label="Toggle annotations sidebar"
              aria-expanded={sidebar}
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </header>
          <WorkspaceLayout
            key={project.id}
            widths={project.columnWidths}
            sidebar={sidebar}
            onChange={(columnWidths) => change((p) => ({ ...p, columnWidths }))}
            onResizeStart={() => {
              setSelection(null);
              setHighlight(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <nav
              className={`outline ${outline ? 'outline-open' : ''}`}
              aria-label="Document outline"
            >
              <button
                className="outline-title"
                onClick={() => {
                  reader.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  setOutline(false);
                }}
              >
                {project.title}
              </button>
              <DocumentOutline
                doc={project.doc}
                annotations={project.annotations}
                onNavigate={(id) => {
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setOutline(false);
                }}
              />
              <div className="outline-meta">
                {project.doc.warnings.length > 0 && (
                  <button className="text-button" onClick={() => setWarnings(true)}>
                    <Info size={16} aria-hidden="true" />
                    {project.doc.warnings.length} import notice
                    {project.doc.warnings.length === 1 ? '' : 's'}
                  </button>
                )}
                <button className="text-button" onClick={() => setSources(true)}>
                  Project files
                </button>
              </div>
            </nav>
            <div
              className="reading-area"
              ref={reader}
              onScroll={() => {
                clearTimeout(scrollTimer.current);
                const scroll = reader.current?.scrollTop ?? 0;
                scrollTimer.current = setTimeout(() => {
                  if (current.current && Math.abs(current.current.scroll - scroll) > 2) {
                    let readingOffset: number | undefined;
                    if (scroll > 100 && paper.current && reader.current) {
                      const top = reader.current.getBoundingClientRect().top + 20;
                      const leaves = [
                        ...paper.current.querySelectorAll<HTMLElement>('[data-leaf]'),
                      ];
                      const leaf = leaves.find((e) => e.getBoundingClientRect().bottom > top);
                      if (leaf) {
                        readingOffset = Number(leaf.dataset.start);
                        if (
                          leaf.dataset.atomic !== 'true' &&
                          leaf.firstChild?.nodeType === Node.TEXT_NODE
                        ) {
                          const point = (document as any).caretPositionFromPoint?.(
                            leaf.getBoundingClientRect().left + 2,
                            Math.max(top, leaf.getBoundingClientRect().top + 2),
                          );
                          const range = (document as any).caretRangeFromPoint?.(
                            leaf.getBoundingClientRect().left + 2,
                            Math.max(top, leaf.getBoundingClientRect().top + 2),
                          );
                          const node = point?.offsetNode ?? range?.startContainer;
                          const offset = point?.offset ?? range?.startOffset;
                          if (node && leaf.contains(node)) {
                            const r = document.createRange();
                            r.selectNodeContents(leaf);
                            r.setEnd(node, offset);
                            readingOffset += r.toString().length;
                          }
                        }
                      }
                    }
                    change((p) => ({ ...p, scroll, readingOffset }));
                  }
                }, 120);
              }}
            >
              {project.doc.warnings.length > 0 && (
                <button className="text-button mobile-notice" onClick={() => setWarnings(true)}>
                  <Info size={16} aria-hidden="true" /> Import notices
                </button>
              )}
              <div
                ref={paper}
                className={`document-content ${project.doc.pdf ? '' : 'text-document-content'}`}
                style={project.doc.pdf ? undefined : { zoom: (project.readerZoom ?? 100) / 100 }}
                tabIndex={0}
                aria-label="Document text. Shift plus arrow keys selects text."
                onKeyDown={(e) => {
                  if (e.shiftKey && e.key.startsWith('Arrow') && !composing.current) {
                    const sel = window.getSelection();
                    if (!sel) return;
                    if (!sel.rangeCount || !paper.current?.contains(sel.anchorNode)) {
                      const leaf = paper.current?.querySelector('[data-leaf]');
                      if (!leaf) return;
                      const r = document.createRange();
                      r.selectNodeContents(leaf);
                      r.collapse(true);
                      sel.removeAllRanges();
                      sel.addRange(r);
                    }
                    e.preventDefault();
                    sel.modify(
                      'extend',
                      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 'backward' : 'forward',
                      e.key === 'ArrowDown' || e.key === 'ArrowUp' ? 'line' : 'character',
                    );
                    capture();
                  }
                }}
                onMouseUp={(e) => {
                  if (!(e.target as HTMLElement).closest('.pdf-area-tool')) capture();
                }}
                onKeyUp={(e) => {
                  if (e.key === 'Shift' || e.key.startsWith('Arrow')) capture();
                }}
                onTouchEnd={() => setTimeout(capture, 100)}
              >
                {project.doc.format === 'pdf' ? (
                  <Suspense fallback={<p className="pdf-help">Opening PDF pages…</p>}>
                    <PdfReader
                      doc={project.doc}
                      annotations={project.annotations}
                      filters={project.filters}
                      active={active}
                      zoom={project.pdfZoom}
                      hideZoom
                      onZoom={(pdfZoom) => change((p) => ({ ...p, pdfZoom }))}
                      onScope={(scope, anchor) => beginNote(scope, anchor)}
                      onSelect={(s) => {
                        setSelection(s);
                        setOverlap(null);
                        setHighlight(null);
                      }}
                      onOverlap={(target) => {
                        setSelection(null);
                        setHighlight(null);
                        setOverlap(target);
                      }}
                      onJump={(id, target) => {
                        setSidebar(true);
                        setActive(id);
                        setSidebarTab('Annotations');
                        setOverlap(null);
                        setHighlight({ id, ...target });
                      }}
                    />
                  </Suspense>
                ) : (
                  <Paper
                    doc={project.doc}
                    annotations={project.annotations}
                    filters={project.filters}
                    active={active}
                    onScope={scopeNote}
                    onOverlap={(target) => {
                      setSelection(null);
                      setHighlight(null);
                      setOverlap(target);
                    }}
                    onJump={(id, target) => {
                      const a = project.annotations.find((a) => a.id === id);
                      if (a) {
                        setSidebar(true);
                        setActive(a.id);
                        setSidebarTab('Annotations');
                        setOverlap(null);
                        setHighlight({ id, ...target });
                      }
                    }}
                  />
                )}
              </div>
            </div>
            {sidebar && (
              <Sidebar
                project={project}
                active={active}
                tab={sidebarTab}
                onTabChange={setSidebarTab}
                onOverlap={setOverlap}
                onJump={jump}
                onEdit={editAnnotation}
                onDelete={removeAnnotation}
                onFilters={(filters) => change((p) => ({ ...p, filters }))}
                onDocument={documentNote}
                onDestination={(id) => {
                  setMoving(id);
                  setDraft(null);
                  setSelection(null);
                }}
              />
            )}
          </WorkspaceLayout>
        </div>
      ) : (
        <Home
          recent={recent}
          onRemove={async (p) => {
            try {
              await deleteLocalProject(p.id);
              setRecent(await recentProjects());
              setRemoved(p);
            } catch {
              setError('Could not remove this document from the list.');
            }
          }}
          onImport={() => input.current?.click()}
          onFolder={() => folderInput.current?.click()}
          onOpen={(p) => void openProject(p)}
          onSample={() => void openProject(sampleProject())}
          onFile={(f) => void importFile(f)}
        />
      )}
      {selection && !draft && !moving && project && (
        <FloatingToolbar
          label="Annotate selection"
          className="selection-actions-toolbar"
          x={selection.rect.x}
          y={selection.rect.y}
        >
          {overlapCount > 0 && (
            <span className="selection-overlap-hint">
              Overlaps {overlapCount} existing note{overlapCount === 1 ? '' : 's'}
            </span>
          )}
          <div className="selection-actions">
            {selectedWordCount > 3 && (
              <span className="selection-word-count" aria-label="Selected word count">
                {selectedWordCount.toLocaleString()} words
              </span>
            )}
            {tools.map(({ type, key, icon: Icon }) => (
              <button
                key={type}
                aria-label={`${type} selection`}
                title={`${type} (${key})`}
                className={`type-${type.toLowerCase()}`}
                onClick={() => annotate(type)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{type}</span>
              </button>
            ))}
            {selectionNotes.length > 0 && (
              <button
                className="remove-highlight"
                onClick={removeSelectedHighlights}
                title="Remove annotation (Delete)"
              >
                <Eraser size={17} aria-hidden="true" />{' '}
                <span>
                  {selectionNotes.length > 1 ? 'Remove annotation…' : 'Remove annotation'}
                </span>
              </button>
            )}
          </div>
        </FloatingToolbar>
      )}
      {highlight && highlightedNote && !selection && !draft && !overlap && (
        <FloatingToolbar
          label="Highlight actions"
          className={`highlight-actions type-${highlightedNote.type.toLowerCase()}`}
          x={highlight.x}
          y={highlight.y}
          onClose={closeHighlight}
        >
          <span className="highlight-actions-label">{highlightedNote.type}</span>
          <button
            onClick={() => editAnnotation(highlightedNote, { x: highlight.x, y: highlight.y })}
          >
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          <button
            className="remove-highlight"
            onClick={() => removeAnnotation(highlightedNote.id)}
            title="Remove (Delete)"
          >
            <Eraser size={17} aria-hidden="true" /> Remove
          </button>
        </FloatingToolbar>
      )}
      {moving && (
        <div className="move-banner" role="status">
          <span>Select where this passage should go.</span>
          {selection && (
            <button
              className="button primary"
              onClick={() => {
                commit((a) =>
                  a.map((x) =>
                    x.id === moving
                      ? { ...x, destination: selection.anchor, destinationUncertain: false }
                      : x,
                  ),
                );
                setMoving(null);
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              Move here
            </button>
          )}
          <button
            className="button"
            onClick={() => {
              setMoving(null);
              setSelection(null);
            }}
          >
            Finish later
          </button>
        </div>
      )}
      {overlap && project && !draft && (
        <OverlapPicker
          target={overlap}
          annotations={project.annotations}
          doc={project.doc}
          onChoose={jump}
          onDelete={removeAnnotation}
          onClose={closeOverlap}
        />
      )}
      {draft && project && (
        <Composer
          key={`${draft.editing?.id ?? 'new'}-${draft.anchor.start}-${draft.type}`}
          draft={draft}
          project={project}
          onSave={finishDraft}
          onClose={closeDraft}
          onSaveNote={saveNote}
          onRemoveNote={(n) => change((p) => ({ ...p, notes: p.notes.filter((x) => x !== n) }))}
          onChange={updateDraft}
        />
      )}
      {exporting && project && (
        <ExportDialog
          project={project}
          onChange={(exportSettings) => change((p) => ({ ...p, exportSettings }))}
          onClose={() => setExporting(false)}
          onError={setError}
        />
      )}
      {savePrompt && project && (
        <Modal title="Save project file" onClose={() => setSavePrompt(false)}>
          <div className="modal-content">
            <p>
              {CAN_PICK_FILE
                ? 'Choose a .nitpick file for this document. Changes save to it automatically.'
                : 'Download a .nitpick file to keep this document and its annotations.'}
            </p>
            <div className="modal-actions">
              <button
                className="button primary"
                disabled={manualSaving}
                onClick={() => void save(false)}
              >
                {CAN_PICK_FILE
                  ? handle.current
                    ? 'Reconnect project file'
                    : 'Choose project file'
                  : 'Download project file'}
              </button>
              <button
                className="button"
                disabled={manualSaving}
                onClick={() => setSavePrompt(false)}
              >
                Continue in browser
              </button>
            </div>
          </div>
        </Modal>
      )}
      {projectRequired && (
        <Modal title="Open the complete LaTeX project" onClose={() => setProjectRequired(null)}>
          <div className="modal-content">
            <p>
              <strong>{projectRequired.file.name}</strong> uses these files. Choose the project
              folder or a ZIP that contains them.
            </p>
            <ul>
              {projectRequired.inputs.map((path, i) => (
                <li key={i}>{path}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="button primary" onClick={() => folderInput.current?.click()}>
                Choose folder
              </button>
              <button
                className="button"
                onClick={() => {
                  setProjectRequired(null);
                  input.current?.click();
                }}
              >
                Choose ZIP
              </button>
              <button
                className="text-button"
                onClick={() => {
                  const file = projectRequired.file;
                  setProjectRequired(null);
                  void importFile(file, true);
                }}
              >
                Open this file only
              </button>
            </div>
          </div>
        </Modal>
      )}
      {mainChoice && (
        <Modal title="Choose the main LaTeX file" onClose={() => setMainChoice(null)}>
          <div className="modal-content">
            <p>Choose the file where the paper begins.</p>
            <div className="choice-list">
              {mainChoice.candidates.map((c) => (
                <button
                  className="main-choice"
                  key={c}
                  onClick={async () => {
                    try {
                      setBusy('Opening LaTeX project and figures…');
                      const doc = mainChoice.originalData
                        ? await importDocument(
                            new File(
                              [
                                Uint8Array.from(atob(mainChoice.originalData), (c) =>
                                  c.charCodeAt(0),
                                ),
                              ],
                              mainChoice.archiveName,
                            ),
                            c,
                          )
                        : (await import('./core/latex')).parseLatex(
                            mainChoice.files,
                            c,
                            mainChoice.assets,
                            mainChoice.archiveName,
                          );
                      await openProject(newProject(doc), false, true);
                      setMainChoice(null);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy('');
                    }
                  }}
                >
                  {c}
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {sources && project && (
        <Modal title="Project files" onClose={() => setSources(false)}>
          <div className="modal-content">
            {project.doc.original && (
              <p>
                {project.doc.format === 'html' ? 'Original HTML: ' : 'Original archive: '}
                <strong>{project.doc.original.name}</strong>
              </p>
            )}
            <ul className="file-list">
              {Object.keys(project.doc.files).map((f) => (
                <li key={f}>
                  <span>{f}</span>
                  {f === project.doc.main && <span className="muted">Main file</span>}
                </li>
              ))}
            </ul>
            {Object.keys(project.doc.assets).length > 0 && (
              <>
                <h3>Images</h3>
                <div className="asset-gallery">
                  {Object.entries(project.doc.assets).map(([name, url]) => (
                    <figure key={name}>
                      <img src={url} alt={name} />
                      <figcaption>{name}</figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      {warnings && project && (
        <Modal title="Import notices" onClose={() => setWarnings(false)}>
          <div className="modal-content">
            <p>The reading copy differs from the original file in these ways:</p>
            <ul>
              {project.doc.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <div className="modal-content">
            <p>Select text, then press a letter.</p>
            <dl className="shortcut-list">
              {tools.map(({ type, key }) => (
                <div key={type}>
                  <dt>{type}</dt>
                  <dd>
                    <kbd>{key}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="shortcut-list">
              <div>
                <dt>Remove annotation</dt>
                <dd>
                  <kbd>Delete</kbd> / <kbd>Backspace</kbd>
                </dd>
              </div>
              <div>
                <dt>Select text</dt>
                <dd>
                  <kbd>Shift+Arrow keys</kbd>
                </dd>
              </div>
              <div>
                <dt>Finish annotation</dt>
                <dd>
                  <kbd>{MOD}Enter</kbd>
                </dd>
              </div>
              <div>
                <dt>Undo</dt>
                <dd>
                  <kbd>{MOD}Z</kbd>
                </dd>
              </div>
              <div>
                <dt>Find in document</dt>
                <dd>{MOD}F · Enter / Shift+Enter for next / previous</dd>
                <dt>Resize columns</dt>
                <dd>Drag a divider, or focus it and use ← / →</dd>
                <dt>Redo</dt>
                <dd>
                  <kbd>{MOD}Shift+Z</kbd>
                </dd>
              </div>
              <div>
                <dt>Save as</dt>
                <dd>
                  <kbd>{MOD}S</kbd>
                </dd>
              </div>
            </dl>
          </div>
        </Modal>
      )}
      {removed && !project && (
        <div className="notice-toast" role="status">
          <span>Removed “{removed.title}”</span>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await restoreLocalProject(removed.id);
                setRecent(await recentProjects());
                setRemoved(null);
              } catch {
                setError('Could not restore this document.');
              }
            }}
          >
            Undo
          </button>
          <button className="icon-button" aria-label="Dismiss" onClick={() => setRemoved(null)}>
            <X size={18} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>{error}</span>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      {(busy || startup) && (
        <div className="loading-toast" role="status">
          <span className="spinner" aria-hidden="true" />
          {busy || 'Loading…'}
        </div>
      )}
    </>
  );
}
