import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardConfig, DashboardFolder, DashboardListFilter, DashboardMeta, DashboardSortField, DashboardStatus, DashboardTemplate, DashboardVersion } from '@dashboard-generator/core';
import { dashboardManager, autosaveController } from './dashboard-manager';
import { useBuilderStore } from './store';
import { timeAgo } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

type ViewMode = 'list' | 'grid';
type Tab = 'all' | 'drafts' | 'published' | 'favorites' | 'recent' | 'archived' | 'templates';

export interface DashboardManagerProps {
  onSelect: (config: DashboardConfig) => void;
  onCreateNew: () => void;
}

interface ContextMenu { x: number; y: number; dashboardId: string }
interface ConfirmDialog { title: string; message: string; onConfirm: () => void }

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const TAB_DEFS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all', label: 'All Dashboards', icon: '◈' },
  { id: 'drafts', label: 'Drafts', icon: '✎' },
  { id: 'published', label: 'Published', icon: '◉' },
  { id: 'favorites', label: 'Favorites', icon: '★' },
  { id: 'recent', label: 'Recently Opened', icon: '◷' },
  { id: 'archived', label: 'Archived', icon: '◱' },
  { id: 'templates', label: 'Templates', icon: '⊞' },
];

const STATUS_META: Record<DashboardStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#f59e0b' },
  published: { label: 'Published', color: '#10b981' },
  archived: { label: 'Archived', color: '#6b7280' },
};

const SORT_OPTIONS: { field: DashboardSortField; label: string }[] = [
  { field: 'updatedAt', label: 'Last modified' },
  { field: 'createdAt', label: 'Date created' },
  { field: 'title', label: 'Name' },
  { field: 'lastAccessedAt', label: 'Last opened' },
  { field: 'widgetCount', label: 'Widget count' },
];

/* ================================================================== */
/*  DashboardManager                                                    */
/* ================================================================== */

export function DashboardManager({ onSelect, onCreateNew }: DashboardManagerProps) {
  const [filter, setFilter] = useState<DashboardListFilter>({ sort: 'updatedAt', sortDir: 'desc' });
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<DashboardVersion[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null);
  const [showTagInput, setShowTagInput] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const folders = useMemo(() => dashboardManager.listFolders(), [activeTab, filter]);
  const allTags = useMemo(() => dashboardManager.getAllTags(), [activeTab, filter]);

  const tabFilter = useMemo<DashboardListFilter>(() => {
    const base: DashboardListFilter = { ...filter };
    switch (activeTab) {
      case 'drafts': base.status = 'draft'; break;
      case 'published': base.status = 'published'; break;
      case 'archived': base.status = 'archived'; break;
      case 'favorites': base.favorite = true; break;
      case 'recent': return { ...base };
      case 'templates': return { ...base };
      default: base.status = 'all';
    }
    return base;
  }, [filter, activeTab]);

  const dashboards = useMemo(() => {
    if (activeTab === 'recent') return dashboardManager.getRecent();
    if (activeTab === 'templates') return [];
    return dashboardManager.list(tabFilter);
  }, [tabFilter, activeTab]);

  const stats = useMemo(() => dashboardManager.getStats(), [dashboards]);

  const templates: DashboardTemplate[] = useMemo(() => {
    try {
      const mod = require('@dashboard-generator/playground');
      return mod.dashboardTemplates ?? [];
    } catch { return []; }
  }, []);

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (renaming || showTagInput) return;
      if (e.key === 'Delete' && selectedIds.size > 0) {
        setConfirmDialog({ title: `Delete ${selectedIds.size} dashboard(s)`, message: 'This action cannot be undone.', onConfirm: () => { dashboardManager.bulkDelete([...selectedIds]); setSelectedIds(new Set()); setConfirmDialog(null); } });
      }
      if (e.key === 'Escape') {
        if (showVersions) setShowVersions(null);
        else if (confirmDialog) setConfirmDialog(null);
        else if (showMoveMenu) setShowMoveMenu(null);
        else if (showImport) setShowImport(false);
        else setSelectedIds(new Set());
      }
    };
    rootRef.current?.addEventListener('keydown', handler);
    return () => rootRef.current?.removeEventListener('keydown', handler);
  }, [selectedIds, renaming, showTagInput, showVersions, confirmDialog, showMoveMenu, showImport]);

  /* ---- Handlers ---- */
  const handleOpen = useCallback((id: string) => {
    dashboardManager.trackAccess(id);
    const draft = dashboardManager.getDraft(id);
    const meta = dashboardManager.get(id);
    if (draft) onSelect(draft);
    else if (meta) onSelect({ id: meta.id, title: meta.title, description: meta.description ?? '', version: '1.0.0', theme: 'light', widgets: [] });
  }, [onSelect]);

  const handleContextAction = useCallback((action: string, id: string) => {
    setContextMenu(null);
    switch (action) {
      case 'rename': { const m = dashboardManager.get(id); if (m) { setRenaming(id); setRenameValue(m.title); } break; }
      case 'duplicate': dashboardManager.duplicate(id); break;
      case 'publish': dashboardManager.publish(id); break;
      case 'unpublish': dashboardManager.unpublish(id); break;
      case 'archive': dashboardManager.archive(id); break;
      case 'restore': dashboardManager.restore(id); break;
      case 'delete': setConfirmDialog({ title: 'Delete dashboard', message: 'This action cannot be undone.', onConfirm: () => { dashboardManager.remove(id); setConfirmDialog(null); } }); break;
      case 'favorite': dashboardManager.toggleFavorite(id); break;
      case 'versions': { setVersions(dashboardManager.listVersions(id)); setShowVersions(id); break; }
      case 'export': { const json = dashboardManager.exportDashboard(id); if (json) { navigator.clipboard.writeText(json); } break; }
      case 'moveTo': setShowMoveMenu(id); break;
    }
  }, []);

  const handleRename = useCallback((id: string) => {
    if (renameValue.trim()) dashboardManager.rename(id, renameValue.trim());
    setRenaming(null);
  }, [renameValue]);

  const handleCreateFolder = useCallback(() => {
    if (newFolderName.trim()) { dashboardManager.createFolder(newFolderName.trim()); setNewFolderName(''); setShowNewFolder(false); }
  }, [newFolderName]);

  const handleRollback = useCallback((id: string, revision: number) => {
    const config = dashboardManager.rollback(id, revision);
    if (config) { onSelect(config); setShowVersions(null); }
  }, [onSelect]);

  const handleSort = useCallback((field: DashboardSortField) => {
    setFilter((f) => ({ ...f, sort: field, sortDir: f.sort === field && f.sortDir === 'desc' ? 'asc' : 'desc' }));
  }, []);

  const handleMoveToFolder = useCallback((dashId: string, folderId: string | undefined) => {
    dashboardManager.moveToFolder(dashId, folderId);
    setShowMoveMenu(null);
  }, []);

  const handleAddTag = useCallback((dashId: string) => {
    if (tagInput.trim()) { dashboardManager.addTag(dashId, tagInput.trim()); setTagInput(''); setShowTagInput(null); }
  }, [tagInput]);

  const handleSelectToggle = useCallback((id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    } else {
      setSelectedIds((prev) => prev.size === 1 && prev.has(id) ? new Set() : new Set([id]));
    }
  }, []);

  const handleImport = useCallback(() => {
    if (importText.trim()) { dashboardManager.importDashboard(importText); setImportText(''); setShowImport(false); }
  }, [importText]);

  const handleExportAll = useCallback(() => {
    const json = dashboardManager.exportAll();
    navigator.clipboard.writeText(json);
  }, []);

  return (
    <div className="dm-root" ref={rootRef} tabIndex={-1}>
      {/* ---- Sidebar ---- */}
      <aside className="dm-sidebar">
        <div className="dm-sidebar-header">
          <h2 className="dm-sidebar-title">Dashboards</h2>
          <div className="dm-sidebar-actions">
            <button className="dm-btn-icon" onClick={() => setShowImport(true)} title="Import">⬆</button>
            <button className="dm-btn-icon" onClick={handleExportAll} title="Export all">⬇</button>
            <button className="dm-btn-icon-primary" onClick={onCreateNew} title="New dashboard">+</button>
          </div>
        </div>

        <div className="dm-search-wrap">
          <span className="dm-search-icon">⌕</span>
          <input className="dm-search" placeholder="Search dashboards..." value={filter.search ?? ''} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
        </div>

        <nav className="dm-tabs">
          {TAB_DEFS.map((tab) => {
            const count = tab.id === 'templates' ? templates.length : tab.id === 'recent' ? 0 : tab.id === 'all' ? stats.total : tab.id === 'drafts' ? stats.drafts : tab.id === 'published' ? stats.published : tab.id === 'favorites' ? stats.favorites : stats.archived;
            return (
              <button key={tab.id} className={`dm-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                <span className="dm-tab-icon">{tab.icon}</span>
                <span className="dm-tab-label">{tab.label}</span>
                {count > 0 && <span className="dm-tab-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="dm-folders-section">
          <div className="dm-section-header">
            <span className="dm-section-title">Folders</span>
            <button className="dm-btn-icon-xs" onClick={() => setShowNewFolder(!showNewFolder)} title="New folder">+</button>
          </div>
          {showNewFolder && (
            <div className="dm-folder-add">
              <input className="dm-input" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} autoFocus />
              <button className="dm-btn dm-btn-primary dm-btn-xs" onClick={handleCreateFolder}>Add</button>
            </div>
          )}
          <button className={`dm-folder-item ${!filter.folderId && activeTab === 'all' ? 'active' : ''}`} onClick={() => setFilter((f) => ({ ...f, folderId: undefined }))}>
            <span className="dm-folder-icon">◈</span> All dashboards
          </button>
          {folders.map((folder) => (
            <div key={folder.id} className="dm-folder-row">
              {editingFolder === folder.id ? (
                <input className="dm-input dm-input-sm" defaultValue={folder.name} onBlur={(e) => { if (e.target.value.trim()) dashboardManager.updateFolder(folder.id, { name: e.target.value.trim() }); setEditingFolder(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingFolder(null); }} autoFocus />
              ) : (
                <button className={`dm-folder-item ${filter.folderId === folder.id ? 'active' : ''}`} onClick={() => setFilter((f) => ({ ...f, folderId: folder.id }))}>
                  <span className="dm-folder-icon">{folder.icon ?? '📁'}</span> {folder.name}
                </button>
              )}
              <button className="dm-btn-icon-xs" onClick={() => setEditingFolder(folder.id)} title="Rename">✎</button>
              <button className="dm-btn-icon-xs dm-btn-danger" onClick={() => setConfirmDialog({ title: `Delete folder "${folder.name}"?`, message: 'Dashboards in this folder will be moved to All Dashboards.', onConfirm: () => { dashboardManager.removeFolder(folder.id); setConfirmDialog(null); } })} title="Delete">×</button>
            </div>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="dm-tags-section">
            <div className="dm-section-header"><span className="dm-section-title">Tags</span></div>
            <div className="dm-tag-list">
              {allTags.map((tag) => (
                <button key={tag} className={`dm-tag ${filter.tags?.includes(tag) ? 'active' : ''}`} onClick={() => setFilter((f) => ({ ...f, tags: f.tags?.includes(tag) ? f.tags.filter((t) => t !== tag) : [...(f.tags ?? []), tag] }))}>{tag}</button>
              ))}
            </div>
          </div>
        )}

        <div className="dm-sidebar-footer">
          <span>{stats.total} dashboards</span>
          <span className="dm-dot">·</span>
          <span>{stats.folders} folders</span>
          <span className="dm-dot">·</span>
          <span>{stats.tags} tags</span>
        </div>
      </aside>

      {/* ---- Main ---- */}
      <main className="dm-main">
        <div className="dm-toolbar">
          <div className="dm-toolbar-left">
            <h3 className="dm-toolbar-title">{TAB_DEFS.find((t) => t.id === activeTab)?.label ?? 'Dashboards'}</h3>
            {selectedIds.size > 0 && (
              <div className="dm-bulk-bar">
                <span className="dm-bulk-count">{selectedIds.size} selected</span>
                <button className="dm-btn dm-btn-xs" onClick={() => setConfirmDialog({ title: `Delete ${selectedIds.size} dashboard(s)`, message: 'This action cannot be undone.', onConfirm: () => { dashboardManager.bulkDelete([...selectedIds]); setSelectedIds(new Set()); setConfirmDialog(null); } })}>Delete</button>
                <button className="dm-btn dm-btn-xs" onClick={() => dashboardManager.bulkArchive([...selectedIds]) & setSelectedIds(new Set())}>Archive</button>
                <button className="dm-btn dm-btn-xs" onClick={() => setShowMoveMenu('bulk')}>Move to...</button>
                <button className="dm-btn dm-btn-xs" onClick={() => setSelectedIds(new Set())}>Clear</button>
              </div>
            )}
            {filter.tags && filter.tags.length > 0 && (
              <div className="dm-active-filters">
                {filter.tags.map((t) => <span key={t} className="dm-active-tag" onClick={() => setFilter((f) => ({ ...f, tags: f.tags?.filter((x) => x !== t) }))}>{t} ×</span>)}
              </div>
            )}
          </div>
          <div className="dm-toolbar-right">
            <select className="dm-sort-select" value={filter.sort ?? 'updatedAt'} onChange={(e) => handleSort(e.target.value as DashboardSortField)}>
              {SORT_OPTIONS.map((opt) => <option key={opt.field} value={opt.field}>{opt.label}</option>)}
            </select>
            <button className={`dm-btn-icon ${filter.sortDir === 'asc' ? 'active' : ''}`} onClick={() => setFilter((f) => ({ ...f, sortDir: f.sortDir === 'asc' ? 'desc' : 'asc' }))} title="Toggle sort direction">{filter.sortDir === 'asc' ? '↑' : '↓'}</button>
            <div className="dm-view-toggle">
              <button className={`dm-btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">☰</button>
              <button className={`dm-btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">▦</button>
            </div>
          </div>
        </div>

        {activeTab === 'templates' ? (
          <div className="dm-templates-grid">
            {templates.length === 0 ? (
              <div className="dm-empty"><span className="dm-empty-icon">⊞</span><h3>No templates available</h3><p>Templates will appear here once configured.</p></div>
            ) : templates.map((tpl) => (
              <button key={tpl.id} className="dm-template-card" onClick={() => { const next = { ...tpl.config, id: `dashboard-${Date.now()}` }; onSelect(next); }}>
                <div className="dm-template-preview" style={{ background: tpl.previewColor }} />
                <div className="dm-template-body">
                  <strong>{tpl.name}</strong>
                  <small>{tpl.description}</small>
                  <span className="dm-template-category">{tpl.category}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'dm-grid' : 'dm-list'}>
            {dashboards.length === 0 ? (
              <div className="dm-empty">
                <span className="dm-empty-icon">📊</span>
                <h3>No dashboards yet</h3>
                <p>Create your first dashboard or browse templates.</p>
                <div className="dm-empty-actions">
                  <button className="dm-btn dm-btn-primary" onClick={onCreateNew}>Create Dashboard</button>
                  <button className="dm-btn" onClick={() => setActiveTab('templates')}>Browse Templates</button>
                </div>
              </div>
            ) : dashboards.map((m) => (
              <div key={m.id} className={`dm-card ${viewMode === 'grid' ? 'dm-card-grid' : 'dm-card-list'} ${selectedIds.has(m.id) ? 'selected' : ''}`} onClick={(e) => handleSelectToggle(m.id, e)} onDoubleClick={() => handleOpen(m.id)} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, dashboardId: m.id }); }}>
                {viewMode === 'grid' && (
                  <div className="dm-card-thumb" style={{ background: m.thumbnail ?? `linear-gradient(135deg, ${STATUS_META[m.status].color}22, ${STATUS_META[m.status].color}08)` }}>
                    <span className="dm-card-thumb-icon">📊</span>
                  </div>
                )}
                <div className="dm-card-body">
                  <div className="dm-card-header">
                    {renaming === m.id ? (
                      <input className="dm-rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRename(m.id)} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(m.id); if (e.key === 'Escape') setRenaming(null); }} autoFocus onClick={(e) => e.stopPropagation()} />
                    ) : (
                      <span className="dm-card-title" onClick={(e) => { e.stopPropagation(); handleOpen(m.id); }}>{m.title}</span>
                    )}
                    <button className="dm-fav-btn" onClick={(e) => { e.stopPropagation(); dashboardManager.toggleFavorite(m.id); }} title={m.favorite ? 'Remove from favorites' : 'Add to favorites'}>{m.favorite ? '★' : '☆'}</button>
                  </div>
                  {m.description && <p className="dm-card-desc">{m.description}</p>}
                  <div className="dm-card-meta">
                    <span className="dm-status-badge" style={{ background: STATUS_META[m.status].color + '18', color: STATUS_META[m.status].color }}>{STATUS_META[m.status].label}</span>
                    <span className="dm-card-meta-item">{m.widgetCount} widget{m.widgetCount !== 1 ? 's' : ''}</span>
                    <span className="dm-card-meta-item">{timeAgo(m.updatedAt)}</span>
                    {m.folderId && <span className="dm-card-meta-item">📁 {folders.find((f) => f.id === m.folderId)?.name}</span>}
                  </div>
                  <div className="dm-card-tags">
                    {m.tags.map((t) => <span key={t} className="dm-card-tag" onClick={(e) => { e.stopPropagation(); dashboardManager.removeTag(m.id, t); }}>{t} ×</span>)}
                    <button className="dm-card-tag-add" onClick={(e) => { e.stopPropagation(); setShowTagInput(m.id); setTagInput(''); }} title="Add tag">+ tag</button>
                  </div>
                  {showTagInput === m.id && (
                    <div className="dm-tag-input-row" onClick={(e) => e.stopPropagation()}>
                      <input className="dm-input dm-input-sm" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag name" onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(m.id); if (e.key === 'Escape') setShowTagInput(null); }} autoFocus />
                      <button className="dm-btn dm-btn-primary dm-btn-xs" onClick={() => handleAddTag(m.id)}>Add</button>
                    </div>
                  )}
                </div>
                <div className="dm-card-actions">
                  <button className="dm-btn-icon" onClick={(e) => { e.stopPropagation(); handleOpen(m.id); }} title="Open">→</button>
                  <button className="dm-btn-icon" onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, dashboardId: m.id }); }} title="More options">⋯</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ---- Context menu ---- */}
      {contextMenu && (
        <>
          <div className="dm-context-backdrop" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="dm-context-menu" style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 300) }}>
            {(() => {
              const m = dashboardManager.get(contextMenu.dashboardId);
              if (!m) return null;
              return <>
                <div className="dm-ctx-header">{m.title}</div>
                <button className="dm-ctx-item" onClick={() => handleContextAction('rename', m.id)}>✎ Rename</button>
                <button className="dm-ctx-item" onClick={() => handleContextAction('duplicate', m.id)}>◫ Duplicate</button>
                <button className="dm-ctx-item" onClick={() => handleContextAction('favorite', m.id)}>{m.favorite ? '☆ Unfavorite' : '★ Favorite'}</button>
                <div className="dm-ctx-divider" />
                {m.status === 'draft' && <button className="dm-ctx-item" onClick={() => handleContextAction('publish', m.id)}>◉ Publish</button>}
                {m.status === 'published' && <button className="dm-ctx-item" onClick={() => handleContextAction('unpublish', m.id)}>◱ Unpublish</button>}
                {m.status !== 'archived' && <button className="dm-ctx-item" onClick={() => handleContextAction('archive', m.id)}>◱ Archive</button>}
                {m.status === 'archived' && <button className="dm-ctx-item" onClick={() => handleContextAction('restore', m.id)}>↻ Restore</button>}
                <div className="dm-ctx-divider" />
                <button className="dm-ctx-item" onClick={() => setShowMoveMenu(m.id)}>📁 Move to folder...</button>
                <button className="dm-ctx-item" onClick={() => { setShowTagInput(m.id); setContextMenu(null); setTagInput(''); }}>⊞ Add tag</button>
                <button className="dm-ctx-item" onClick={() => handleContextAction('versions', m.id)}>◷ Version history</button>
                <button className="dm-ctx-item" onClick={() => handleContextAction('export', m.id)}>⬇ Export to clipboard</button>
                <div className="dm-ctx-divider" />
                <button className="dm-ctx-item dm-ctx-danger" onClick={() => handleContextAction('delete', m.id)}>✕ Delete</button>
              </>;
            })()}
          </div>
        </>
      )}

      {/* ---- Move to folder popover ---- */}
      {showMoveMenu && (
        <>
          <div className="dm-context-backdrop" onClick={() => setShowMoveMenu(null)} onContextMenu={(e) => { e.preventDefault(); setShowMoveMenu(null); }} />
          <div className="dm-context-menu" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
            <div className="dm-ctx-header">Move to folder</div>
            <button className="dm-ctx-item" onClick={() => { const ids = showMoveMenu === 'bulk' ? [...selectedIds] : [showMoveMenu]; ids.forEach((id) => dashboardManager.moveToFolder(id, undefined)); setShowMoveMenu(null); setSelectedIds(new Set()); }}>No folder (root)</button>
            {folders.map((f) => (
              <button key={f.id} className="dm-ctx-item" onClick={() => { const ids = showMoveMenu === 'bulk' ? [...selectedIds] : [showMoveMenu]; ids.forEach((id) => dashboardManager.moveToFolder(id, f.id)); setShowMoveMenu(null); setSelectedIds(new Set()); }}>📁 {f.name}</button>
            ))}
            <div className="dm-ctx-divider" />
            <button className="dm-ctx-item" onClick={() => setShowMoveMenu(null)}>Cancel</button>
          </div>
        </>
      )}

      {/* ---- Version history modal ---- */}
      {showVersions && (
        <div className="dm-modal-backdrop" onClick={() => setShowVersions(null)}>
          <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <h3>Version History</h3>
              <button className="dm-btn-icon" onClick={() => setShowVersions(null)}>×</button>
            </div>
            <div className="dm-modal-body">
              {versions.length === 0 ? (
                <p className="dm-empty-text">No versions saved yet. Use "Save version" to create a snapshot.</p>
              ) : (
                <div className="dm-version-list">
                  {versions.map((v, i) => (
                    <div key={v.revision} className={`dm-version-row ${i === 0 ? 'current' : ''}`}>
                      <div className="dm-version-info">
                        <span className="dm-version-num">v{v.revision}</span>
                        <span className="dm-version-msg">{v.message ?? 'Manual save'}</span>
                      </div>
                      <div className="dm-version-right">
                        <span className="dm-version-date">{timeAgo(v.createdAt)}</span>
                        {i > 0 && <button className="dm-btn dm-btn-xs" onClick={() => handleRollback(showVersions, v.revision)}>Rollback</button>}
                        {i === 0 && <span className="dm-version-current">Current</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Import modal ---- */}
      {showImport && (
        <div className="dm-modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <h3>Import Dashboard</h3>
              <button className="dm-btn-icon" onClick={() => setShowImport(false)}>×</button>
            </div>
            <div className="dm-modal-body">
              <p className="dm-empty-text">Paste a previously exported dashboard JSON below.</p>
              <textarea className="dm-import-textarea" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste dashboard JSON here..." rows={10} />
            </div>
            <div className="dm-modal-footer">
              <button className="dm-btn" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="dm-btn dm-btn-primary" onClick={handleImport} disabled={!importText.trim()}>Import</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Confirm dialog ---- */}
      {confirmDialog && (
        <div className="dm-modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div className="dm-modal dm-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="dm-modal-header">
              <h3>{confirmDialog.title}</h3>
            </div>
            <div className="dm-modal-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="dm-modal-footer">
              <button className="dm-btn" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button className="dm-btn dm-btn-danger" onClick={confirmDialog.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated Use `DashboardManager` instead */
export const DashboardList = DashboardManager;
export type DashboardListProps = DashboardManagerProps;
