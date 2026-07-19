import type { DashboardConfig, DashboardFolder, DashboardListFilter, DashboardMeta, DashboardStatus, DashboardVersion, AutosaveConfig, Primitive } from '@dashboard-generator/core';
import { readJson, writeJson } from './utils';

/* ================================================================== */
/*  Storage keys                                                       */
/* ================================================================== */

const META_KEY = 'dashboard-generator:dmeta:v1';
const FOLDER_KEY = 'dashboard-generator:folders:v1';
const VERSION_KEY = 'dashboard-generator:versions:v1';
const AUTOSAVE_KEY = 'dashboard-generator:autosave-config:v1';
const RECENT_KEY = 'dashboard-generator:recent:v1';
const DRAFT_KEY = 'dashboard-generator:drafts:v1';

/* ================================================================== */
/*  DashboardMeta store                                                 */
/* ================================================================== */

const readMeta = (): DashboardMeta[] => readJson(META_KEY, []);
const writeMeta = (list: DashboardMeta[]) => writeJson(META_KEY, list);

/* ================================================================== */
/*  Folder store                                                        */
/* ================================================================== */

const readFolders = (): DashboardFolder[] => readJson(FOLDER_KEY, []);
const writeFolders = (list: DashboardFolder[]) => writeJson(FOLDER_KEY, list);

/* ================================================================== */
/*  Version store                                                       */
/* ================================================================== */

const readVersions = (): Record<string, DashboardVersion[]> => readJson(VERSION_KEY, {});
const writeVersions = (map: Record<string, DashboardVersion[]>) => writeJson(VERSION_KEY, map);

/* ================================================================== */
/*  Draft store                                                         */
/* ================================================================== */

const readDrafts = (): Record<string, DashboardConfig> => readJson(DRAFT_KEY, {});
const writeDrafts = (map: Record<string, DashboardConfig>) => writeJson(DRAFT_KEY, map);

/* ================================================================== */
/*  Recent store                                                        */
/* ================================================================== */

const RECENT_MAX = 20;
const readRecent = (): string[] => readJson(RECENT_KEY, []);
const writeRecent = (ids: string[]) => writeJson(RECENT_KEY, ids);

/* ================================================================== */
/*  Autosave config                                                     */
/* ================================================================== */

const readAutosaveConfig = (): AutosaveConfig => readJson(AUTOSAVE_KEY, { enabled: true, intervalMs: 30000 });

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

const now = () => new Date().toISOString();

const metaToDashboard = (m: DashboardMeta): DashboardConfig => ({
  id: m.id, title: m.title, description: m.description ?? '', version: '1.0.0', theme: 'light', widgets: [],
});

/* ================================================================== */
/*  dashboardManager                                                    */
/* ================================================================== */

export const dashboardManager = {
  /* ---- List / Query ---- */

  list(filter?: DashboardListFilter): DashboardMeta[] {
    let list = readMeta().filter((m) => !m.archivedAt || filter?.status === 'archived');
    if (filter?.status && filter.status !== 'all') {
      if (filter.status === 'archived') list = readMeta().filter((m) => !!m.archivedAt);
      else list = list.filter((m) => m.status === filter.status && !m.archivedAt);
    }
    if (filter?.folderId !== undefined) list = list.filter((m) => m.folderId === filter.folderId);
    if (filter?.favorite) list = list.filter((m) => m.favorite);
    if (filter?.tags && filter.tags.length > 0) list = list.filter((m) => filter.tags!.some((t) => m.tags.includes(t)));
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)));
    }
    const sort = filter?.sort ?? 'updatedAt';
    const dir = filter?.sortDir ?? 'desc';
    list.sort((a, b) => {
      const av = a[sort] ?? '';
      const bv = b[sort] ?? '';
      if (sort === 'widgetCount') return dir === 'asc' ? (a.widgetCount - b.widgetCount) : (b.widgetCount - a.widgetCount);
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  },

  get(id: string): DashboardMeta | undefined {
    return readMeta().find((m) => m.id === id);
  },

  /* ---- CRUD ---- */

  create(config: DashboardConfig, meta?: Partial<DashboardMeta>): DashboardMeta {
    const existing = readMeta();
    const record: DashboardMeta = {
      id: config.id,
      title: config.title,
      description: config.description,
      status: 'draft',
      tags: [],
      favorite: false,
      widgetCount: config.widgets.length,
      createdAt: now(),
      updatedAt: now(),
      version: 1,
      ...meta,
    };
    existing.push(record);
    writeMeta(existing);
    this.trackAccess(config.id);
    return record;
  },

  update(id: string, patch: Partial<DashboardMeta>): DashboardMeta | undefined {
    const list = readMeta();
    const idx = list.findIndex((m) => m.id === id);
    if (idx === -1) return undefined;
    list[idx] = { ...list[idx], ...patch, id, updatedAt: now() };
    writeMeta(list);
    return list[idx];
  },

  remove(id: string): boolean {
    const list = readMeta();
    const idx = list.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    writeMeta(list);
    this.removeRecent(id);
    return true;
  },

  duplicate(id: string, newTitle?: string): DashboardMeta | undefined {
    const source = this.get(id);
    if (!source) return undefined;
    const config = this.getDraft(id) ?? metaToDashboard(source);
    const newId = `dashboard-${Date.now()}`;
    const newConfig = { ...config, id: newId, title: newTitle ?? `${source.title} (copy)` };
    this.saveDraft(newId, newConfig);
    return this.create(newConfig, { folderId: source.folderId, tags: [...source.tags] });
  },

  rename(id: string, title: string): DashboardMeta | undefined {
    return this.update(id, { title });
  },

  /* ---- Status ---- */

  publish(id: string): DashboardMeta | undefined {
    return this.update(id, { status: 'published', publishedAt: now() });
  },

  unpublish(id: string): DashboardMeta | undefined {
    return this.update(id, { status: 'draft', publishedAt: undefined });
  },

  archive(id: string): DashboardMeta | undefined {
    return this.update(id, { status: 'archived', archivedAt: now() });
  },

  restore(id: string): DashboardMeta | undefined {
    return this.update(id, { status: 'draft', archivedAt: undefined });
  },

  /* ---- Favorites ---- */

  toggleFavorite(id: string): DashboardMeta | undefined {
    const m = this.get(id);
    if (!m) return undefined;
    return this.update(id, { favorite: !m.favorite });
  },

  /* ---- Tags ---- */

  addTag(id: string, tag: string): DashboardMeta | undefined {
    const m = this.get(id);
    if (!m || m.tags.includes(tag)) return m;
    return this.update(id, { tags: [...m.tags, tag] });
  },

  removeTag(id: string, tag: string): DashboardMeta | undefined {
    const m = this.get(id);
    if (!m) return undefined;
    return this.update(id, { tags: m.tags.filter((t) => t !== tag) });
  },

  getAllTags(): string[] {
    const tags = new Set<string>();
    readMeta().forEach((m) => m.tags.forEach((t) => tags.add(t)));
    return [...tags].sort();
  },

  /* ---- Folders ---- */

  listFolders(): DashboardFolder[] {
    return readFolders();
  },

  createFolder(name: string, parentId?: string): DashboardFolder {
    const folders = readFolders();
    const folder: DashboardFolder = { id: `folder-${Date.now()}`, name, parentId, createdAt: now(), updatedAt: now() };
    folders.push(folder);
    writeFolders(folders);
    return folder;
  },

  updateFolder(id: string, patch: Partial<DashboardFolder>): DashboardFolder | undefined {
    const folders = readFolders();
    const idx = folders.findIndex((f) => f.id === id);
    if (idx === -1) return undefined;
    folders[idx] = { ...folders[idx], ...patch, id, updatedAt: now() };
    writeFolders(folders);
    return folders[idx];
  },

  removeFolder(id: string): boolean {
    const folders = readFolders();
    const filtered = folders.filter((f) => f.id !== id && f.parentId !== id);
    if (filtered.length === folders.length) return false;
    writeFolders(filtered);
    const dashboards = readMeta();
    dashboards.forEach((d) => { if (d.folderId === id) d.folderId = undefined; });
    writeMeta(dashboards);
    return true;
  },

  getFolderPath(id: string): string[] {
    const folders = readFolders();
    const path: string[] = [];
    let current = folders.find((f) => f.id === id);
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }
    return path;
  },

  /* ---- Versions ---- */

  saveVersion(id: string, config: DashboardConfig, message?: string): DashboardVersion {
    const versions = readVersions();
    if (!versions[id]) versions[id] = [];
    const revision = versions[id].length + 1;
    const version: DashboardVersion = { revision, config: { ...config }, message, createdAt: now(), createdBy: 'local-user' };
    versions[id].push(version);
    if (versions[id].length > 100) versions[id] = versions[id].slice(-100);
    writeVersions(versions);
    this.update(id, { version: revision });
    return version;
  },

  listVersions(id: string): DashboardVersion[] {
    return (readVersions()[id] ?? []).sort((a, b) => b.revision - a.revision);
  },

  getVersion(id: string, revision: number): DashboardVersion | undefined {
    return (readVersions()[id] ?? []).find((v) => v.revision === revision);
  },

  rollback(id: string, revision: number): DashboardConfig | undefined {
    const version = this.getVersion(id, revision);
    if (!version) return undefined;
    this.saveVersion(id, version.config, `Rollback to v${revision}`);
    return version.config;
  },

  /* ---- Drafts ---- */

  saveDraft(id: string, config: DashboardConfig): void {
    const drafts = readDrafts();
    drafts[id] = config;
    writeDrafts(drafts);
    this.update(id, { updatedAt: now() });
  },

  getDraft(id: string): DashboardConfig | undefined {
    return readDrafts()[id];
  },

  deleteDraft(id: string): void {
    const drafts = readDrafts();
    delete drafts[id];
    writeDrafts(drafts);
  },

  /* ---- Autosave ---- */

  getAutosaveConfig(): AutosaveConfig {
    return readAutosaveConfig();
  },

  setAutosaveConfig(patch: Partial<AutosaveConfig>): AutosaveConfig {
    const config = { ...readAutosaveConfig(), ...patch };
    writeJson(AUTOSAVE_KEY, config);
    return config;
  },

  /* ---- Recent ---- */

  trackAccess(id: string): void {
    const recent = readRecent().filter((r) => r !== id);
    recent.unshift(id);
    writeRecent(recent.slice(0, RECENT_MAX));
    this.update(id, { lastAccessedAt: now() });
  },

  getRecent(): DashboardMeta[] {
    const recent = readRecent();
    const all = readMeta();
    return recent.map((id) => all.find((m) => m.id === id)).filter((m): m is DashboardMeta => !!m);
  },

  removeRecent(id: string): void {
    writeRecent(readRecent().filter((r) => r !== id));
  },

  /* ---- Bulk ---- */

  getStats(): { total: number; published: number; drafts: number; archived: number; favorites: number; folders: number; tags: number } {
    const meta = readMeta();
    return {
      total: meta.length,
      published: meta.filter((m) => m.status === 'published' && !m.archivedAt).length,
      drafts: meta.filter((m) => m.status === 'draft' && !m.archivedAt).length,
      archived: meta.filter((m) => !!m.archivedAt).length,
      favorites: meta.filter((m) => m.favorite).length,
      folders: readFolders().length,
      tags: new Set(meta.flatMap((m) => m.tags)).size,
    };
  },

  /* ---- Move to folder ---- */

  moveToFolder(id: string, folderId: string | undefined): DashboardMeta | undefined {
    return this.update(id, { folderId });
  },

  /* ---- Bulk operations ---- */

  bulkDelete(ids: string[]): number { let count = 0; ids.forEach((id) => { if (this.remove(id)) count++; }); return count; },
  bulkArchive(ids: string[]): number { let count = 0; ids.forEach((id) => { if (this.archive(id)) count++; }); return count; },
  bulkRestore(ids: string[]): number { let count = 0; ids.forEach((id) => { if (this.restore(id)) count++; }); return count; },
  bulkPublish(ids: string[]): number { let count = 0; ids.forEach((id) => { if (this.publish(id)) count++; }); return count; },
  bulkMoveToFolder(ids: string[], folderId: string | undefined): number { let count = 0; ids.forEach((id) => { if (this.moveToFolder(id, folderId)) count++; }); return count; },
  bulkAddTag(ids: string[], tag: string): number { let count = 0; ids.forEach((id) => { if (this.addTag(id, tag)) count++; }); return count; },
  bulkRemoveTag(ids: string[], tag: string): number { let count = 0; ids.forEach((id) => { if (this.removeTag(id, tag)) count++; }); return count; },

  /* ---- Export / Import ---- */

  exportDashboard(id: string): string | undefined {
    const meta = this.get(id);
    if (!meta) return undefined;
    const draft = this.getDraft(id);
    const config = draft ?? metaToDashboard(meta);
    const versions = this.listVersions(id);
    const payload = { meta, config, versions, exportedAt: now() };
    return JSON.stringify(payload, null, 2);
  },

  exportAll(): string {
    const payload = {
      dashboards: readMeta().map((m) => ({ meta: m, config: this.getDraft(m.id) ?? metaToDashboard(m), versions: this.listVersions(m.id) })),
      folders: readFolders(),
      exportedAt: now(),
    };
    return JSON.stringify(payload, null, 2);
  },

  importDashboard(json: string): DashboardMeta | undefined {
    try {
      const data = JSON.parse(json);
      if (data.meta && data.config) {
        const config: DashboardConfig = data.config;
        config.id = `dashboard-${Date.now()}`;
        data.meta.id = config.id;
        data.meta.createdAt = now();
        data.meta.updatedAt = now();
        if (data.versions) { const versions = readVersions(); versions[config.id] = data.versions; writeVersions(versions); }
        this.saveDraft(config.id, config);
        return this.create(config, { ...data.meta, status: 'draft' });
      }
    } catch { /* ignore */ }
    return undefined;
  },

  /* ---- Search index (simple) ---- */

  search(query: string): DashboardMeta[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return readMeta().filter((m) => !m.archivedAt && (
      m.title.toLowerCase().includes(q) ||
      (m.description ?? '').toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q))
    ));
  },
};

/* ================================================================== */
/*  Autosave controller                                                 */
/* ================================================================== */

let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let autosaveCallback: (() => void) | null = null;

export const autosaveController = {
  start(callback: () => void) {
    this.stop();
    autosaveCallback = callback;
    const config = dashboardManager.getAutosaveConfig();
    if (!config.enabled) return;
    autosaveTimer = setInterval(() => {
      if (autosaveCallback) autosaveCallback();
      dashboardManager.setAutosaveConfig({ lastSavedAt: now() });
    }, config.intervalMs);
  },

  stop() {
    if (autosaveTimer) { clearInterval(autosaveTimer); autosaveTimer = null; }
    autosaveCallback = null;
  },

  trigger() {
    if (autosaveCallback) autosaveCallback();
    dashboardManager.setAutosaveConfig({ lastSavedAt: now() });
  },

  getStatus(): { active: boolean; lastSaved?: string; intervalMs: number } {
    const config = dashboardManager.getAutosaveConfig();
    return { active: !!autosaveTimer, lastSaved: config.lastSavedAt, intervalMs: config.intervalMs };
  },
};
