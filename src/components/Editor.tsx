"use client";
import { useEffect, useState } from "react";
import { FolderOpen, Redo2, Undo2, Download, FilePlus2, Check, Loader2, AlertTriangle } from "lucide-react";
import { useEditor } from "@/lib/store";
import { engine } from "@/lib/engine";
import { clearHandle, fsSupported, hasPermission, isPrivateHandle, loadHandle } from "@/lib/fs";
import MediaPanel from "./MediaPanel";
import Preview from "./Preview";
import Inspector from "./Inspector";
import Timeline from "./Timeline";
import ExportDialog from "./ExportDialog";
import Mixer from "./Mixer";
import DialogHost from "./DialogHost";
import { confirmDialog } from "@/lib/dialog";

export default function Editor() {
  const s = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [tlH, setTlH] = useState(300);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [saved, setSaved] = useState<FileSystemDirectoryHandle | null>(null);
  const [supported, setSupported] = useState(true);
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    setSupported(fsSupported());
    try { setEmbedded(window.self !== window.top); } catch { setEmbedded(true); }
  }, []);

  // offer to re-open the last used folder
  useEffect(() => {
    loadHandle().then(async (h) => {
      if (!h) return;
      if (await isPrivateHandle(h)) { await clearHandle(); return; } // leftover from an older build — not a real folder
      setSaved(h);
    });
  }, []);

  // pick up files dropped into <project folder>/media from Finder / Explorer
  useEffect(() => {
    const rescan = () => { if (document.visibilityState === "visible" && useEditor.getState().dir) void useEditor.getState().scanMedia(true); };
    window.addEventListener("focus", rescan);
    document.addEventListener("visibilitychange", rescan);
    return () => { window.removeEventListener("focus", rescan); document.removeEventListener("visibilitychange", rescan); };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") { e.preventDefault(); engine.toggle(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); st.redo(); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); st.duplicateSelected(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); st.saveNow(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.shiftKey ? st.rippleDelete() : st.deleteSelected(); }
      else if (e.key.toLowerCase() === "s" && !mod) { st.splitAtPlayhead(); }
      else if (e.key === "ArrowLeft") { engine.seek(st.time - (e.shiftKey ? 1 : 1 / st.project.fps)); }
      else if (e.key === "ArrowRight") { engine.seek(st.time + (e.shiftKey ? 1 : 1 / st.project.fps)); }
      else if (e.key === "Home") engine.seek(0);
      else if (mod && e.key.toLowerCase() === "c") { st.copy(); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); st.paste(); }
      else if (e.key.toLowerCase() === "m" && !mod) { st.addMarker(); }
      else if (mod && e.key.toLowerCase() === "g") { e.preventDefault(); e.shiftKey ? st.ungroupSelected() : st.groupSelected(); }
      else if (e.key === "Escape") { st.setAnnot(null); }
      else if (e.altKey && e.key.toLowerCase() === "x") { st.setRange(null, null); }
      else if (!mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "v") st.setTool("select");
        else if (k === "c") st.setTool("razor");
        else if (k === "b") st.setTool("ripple");
        else if (k === "n") st.setTool("roll");
        else if (k === "y") st.setTool("slip");
        else if (k === "j") engine.shuttle(-1);
        else if (k === "k") engine.shuttle(0);
        else if (k === "l") engine.shuttle(1);
        else if (k === "i") { const o = st.project.rangeOut; st.setRange(st.time, o != null && o > st.time ? o : null); }
        else if (k === "o") { const i = st.project.rangeIn ?? 0; if (st.time > i) st.setRange(i, st.time); }
        else if (k === ";") st.liftRange(false);
        else if (k === "'") st.liftRange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reopen = async () => {
    if (!saved) return;
    try {
      if (await hasPermission(saved, true)) { await s.attachFolder(saved); setSaved(null); }
      else useEditor.setState({ folderError: "Permission to the previous folder was not granted. Choose the folder again." });
    } catch (err) {
      useEditor.setState({ folderError: `Could not reopen “${saved.name}”: ${(err as Error)?.message ?? err}. It may have been moved or deleted — choose a folder instead.` });
    }
  };

  const status =
    s.saveStatus === "saving" ? <><Loader2 size={13} className="animate-spin" /> Saving…</> :
    s.saveStatus === "saved" ? <><Check size={13} className="text-[var(--accent)]" /> Saved to folder</> :
    s.saveStatus === "error" ? <><AlertTriangle size={13} className="text-amber-400" /> Save failed</> : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-3">
        <div className="font-semibold tracking-tight text-[var(--accent)]">◼ Offcut</div>
        <input
          className="field !w-56 !bg-transparent"
          value={s.project.name}
          onChange={(e) => s.patchProject({ name: e.target.value })}
        />
        <div className="ml-2 flex items-center gap-2 text-xs text-[var(--muted)]">
          {s.dir ? <span className="flex items-center gap-1">📁 {s.dir.name}</span> : <span>{s.memoryMode ? "⚠ Temporary project — not saved to disk" : "No folder selected"}</span>}
          <span className="flex items-center gap-1">{status}</span>
        </div>
        <div className="flex-1" />
        {saved && !s.dir && (
          <button className="btn" onClick={reopen}><FolderOpen size={15} /> Reopen “{saved.name}”</button>
        )}
        <button className="btn" onClick={async () => { if (!s.project.clips.length || await confirmDialog({ title: "Start a new project?", message: "You will pick a new folder for it. The current project stays saved in its own folder.", confirmLabel: "New project" })) s.newProject(); }}><FilePlus2 size={15} /> New</button>
        <button className="btn" disabled={!supported} title={supported ? "" : "Use Chrome / Edge for local folder saving"} onClick={s.chooseFolder}><FolderOpen size={15} /> {s.dir ? "Change folder" : "Choose save folder"}</button>
        <button className="btn" disabled={!s.past.length} onClick={s.undo} title="Undo (Ctrl/Cmd+Z)"><Undo2 size={15} /></button>
        <button className="btn" disabled={!s.future.length} onClick={s.redo} title="Redo"><Redo2 size={15} /></button>
        <button className="btn btn-primary" disabled={!s.project.clips.length} onClick={() => setExportOpen(true)}><Download size={15} /> Export</button>
      </header>

      {s.folderError && (s.dir || s.memoryMode) && (
        <div className="flex items-start gap-3 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-200">
          <span className="flex-1">{s.folderError}</span>
          <button className="underline" onClick={s.clearFolderError}>Dismiss</button>
        </div>
      )}
      {!supported && (
        <div className="bg-amber-500/15 px-3 py-1 text-xs text-amber-300">
          This browser has no local-folder access. Editing works, but projects can't be saved to a folder — use Chrome or Edge. Exports download normally.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[300px] shrink-0 border-r border-[var(--line)] bg-[var(--panel)]"><MediaPanel /></aside>
        <main className="min-w-0 flex-1 bg-[var(--bg)]"><Preview /></main>
        <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--panel)]"><Inspector /></aside>
      </div>

      <div
        className="h-1.5 shrink-0 cursor-row-resize bg-[var(--line)] hover:bg-[var(--accent)]"
        onPointerDown={(ev) => {
          const y0 = ev.clientY, h0 = tlH;
          const mv = (m: PointerEvent) => setTlH(Math.max(180, Math.min(window.innerHeight - 260, h0 + (y0 - m.clientY))));
          const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
        }}
      />
      <section className="shrink-0 bg-[var(--panel)]" style={{ height: tlH }}><Timeline onMixer={() => setMixerOpen(true)} /></section>

      {s.busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--panel2)] px-4 py-3"><Loader2 className="animate-spin" size={16} /> {s.busy}</div>
        </div>
      )}
      {supported && !s.dir && !s.memoryMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--bg)]/95">
          <div className="w-[480px] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
            <FolderOpen className="mx-auto mb-3 text-[var(--accent)]" size={36} />
            <h2 className="mb-2 text-lg font-semibold">Choose a project folder</h2>
            <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">
              All your media, the project file and exports are stored in this folder on your disk — not in browser memory and never uploaded.
              Pick a new empty folder to start, or an existing project folder to continue.
            </p>
            {s.folderError && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-xs leading-relaxed text-amber-200">
                <b>Couldn’t open that folder.</b><br />{s.folderError}
                <button className="mt-2 block underline hover:text-white" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy this page’s link ({typeof window !== "undefined" ? window.location.origin : ""})</button>
              </div>
            )}
            {embedded && (
              <div className="mb-4 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-left text-xs leading-relaxed text-sky-200">
                You are viewing this inside an embedded / preview window — browsers block the folder picker there.
                <button className="btn btn-primary mt-2 w-full justify-center" onClick={() => window.open(window.location.href, "_blank")}>Open in a new browser tab</button>
              </div>
            )}
            <div className="flex justify-center gap-2">
              <button className="btn btn-primary" onClick={s.chooseFolder}><FolderOpen size={15} /> Choose folder</button>
              {saved && <button className="btn" onClick={reopen}>Reopen “{saved.name}”</button>}
            </div>
            {s.folderError && (
              <button className="mt-3 text-xs text-[var(--muted)] underline hover:text-white" onClick={() => s.setMemoryMode(true)}>
                Continue without a folder (temporary — nothing is saved to disk)
              </button>
            )}
          </div>
        </div>
      )}
      <DialogHost />
      {mixerOpen && <Mixer onClose={() => setMixerOpen(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
