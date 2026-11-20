// Local-folder persistence using the File System Access API. Nothing is uploaded anywhere.
import type { Project } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const fsSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/* ---------- remember the chosen folder across reloads (IndexedDB) ---------- */
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("offline-video-editor", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveHandle(h: FileSystemDirectoryHandle) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(h, "dir");
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const r = db.transaction("kv").objectStore("kv").get("dir");
      r.onsuccess = () => res((r.result as FileSystemDirectoryHandle) ?? null);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return null;
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const h = await (window as any).showDirectoryPicker({ mode: "readwrite", id: "video-editor" });
  await saveHandle(h);
  return h;
}

export async function hasPermission(h: FileSystemDirectoryHandle, request = false) {
  const opts = { mode: "readwrite" };
  if ((await (h as any).queryPermission(opts)) === "granted") return true;
  if (request && (await (h as any).requestPermission(opts)) === "granted") return true;
  return false;
}

/* ---------- file helpers ---------- */
async function subdir(root: FileSystemDirectoryHandle, parts: string[]) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
  return d;
}

export async function writeFile(root: FileSystemDirectoryHandle, path: string, data: Blob | string) {
  const parts = path.split("/");
  const name = parts.pop()!;
  const dir = await subdir(root, parts);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await (fh as any).createWritable();
  if (typeof data === "string") {
    await w.write(data);
    await w.close();
  } else {
    await data.stream().pipeTo(w); // streamed from disk to disk — never fully loaded into memory
  }
}

export async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<File | null> {
  try {
    const parts = path.split("/");
    const name = parts.pop()!;
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    return await (await d.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export async function openWritable(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemWritableFileStream> {
  const parts = path.split("/");
  const name = parts.pop()!;
  const dir = await subdir(root, parts);
  return (await (await dir.getFileHandle(name, { create: true })) as any).createWritable();
}

export async function removeFile(root: FileSystemDirectoryHandle, path: string) {
  try {
    const parts = path.split("/");
    const name = parts.pop()!;
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    await d.removeEntry(name);
  } catch { /* ignore */ }
}

export async function fileExists(root: FileSystemDirectoryHandle, path: string) {
  return (await readFile(root, path)) !== null;
}

export const saveProjectJson = (root: FileSystemDirectoryHandle, p: Project) =>
  writeFile(root, "project.json", JSON.stringify(p, null, 2));

export async function readProjectJson(root: FileSystemDirectoryHandle): Promise<Project | null> {
  const f = await readFile(root, "project.json");
  if (!f) return null;
  try {
    return JSON.parse(await f.text()) as Project;
  } catch {
    return null;
  }
}

export const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_");

/** keep only the newest `keep` files of backups/ */
export async function pruneBackups(root: FileSystemDirectoryHandle, keep = 10) {
  try {
    const d = await root.getDirectoryHandle("backups");
    const names: string[] = [];
    for await (const [n, h] of (d as any).entries()) if (h.kind === "file") names.push(n);
    names.sort();
    for (const n of names.slice(0, Math.max(0, names.length - keep))) await d.removeEntry(n);
  } catch { /* ignore */ }
}

/** true when a handle belongs to the browser-private storage (legacy projects from an older build) */
export async function isPrivateHandle(h: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const root = await (navigator.storage as any).getDirectory();
    return (await root.resolve(h)) !== null;
  } catch { return false; }
}
export async function clearHandle() {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete("dir"); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch { /* ignore */ }
}

/** every file inside <project>/media (recursive, a few levels deep) */
export async function listMediaFiles(root: FileSystemDirectoryHandle): Promise<{ path: string; file: File }[]> {
  const out: { path: string; file: File }[] = [];
  let media: FileSystemDirectoryHandle;
  try { media = await root.getDirectoryHandle("media"); } catch { return out; } // no media folder yet
  async function walk(d: FileSystemDirectoryHandle, prefix: string, depth: number) {
    for await (const [name, h] of (d as any).entries()) {
      if (name.startsWith(".")) continue; // .DS_Store etc.
      if (h.kind === "directory") { if (depth < 4) await walk(h, `${prefix}${name}/`, depth + 1); continue; }
      try { out.push({ path: `${prefix}${name}`, file: await h.getFile() }); } catch { /* unreadable */ }
    }
  }
  await walk(media, "media/", 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
