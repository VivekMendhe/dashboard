import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardConfig, DashboardRole, DashboardShare, DataRecord, EmbedSettings, ShareCollaborator, ShareLink, ShareVisibility } from '@dashboard-generator/core';
import { shareManager } from './share-manager';
import { timeAgo } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface SharePanelProps {
  dashboard: DashboardConfig;
  onUpdate: (patch: Partial<DashboardConfig>) => void;
  data?: DataRecord[];
}

type ShareTab = 'links' | 'collaborators' | 'embed' | 'export';

/* ================================================================== */
/*  Constants                                                           */
/* ================================================================== */

const VISIBILITY_OPTIONS: { value: ShareVisibility; label: string; desc: string; icon: string }[] = [
  { value: 'private', label: 'Private', desc: 'Only you and invited collaborators can access', icon: '🔒' },
  { value: 'workspace', label: 'Workspace', desc: 'Anyone in your workspace can view', icon: '👥' },
  { value: 'link', label: 'Public link', desc: 'Anyone with the link can view', icon: '🌐' },
];

const ROLE_OPTIONS: { value: DashboardRole; label: string; desc: string }[] = [
  { value: 'viewer', label: 'Viewer', desc: 'Can view and export' },
  { value: 'editor', label: 'Editor', desc: 'Can view, edit, and export' },
  { value: 'admin', label: 'Admin', desc: 'Full access including sharing' },
];

const EXPORT_FORMATS: { format: 'pdf' | 'png' | 'excel' | 'csv'; label: string; icon: string; desc: string }[] = [
  { format: 'pdf', label: 'PDF', icon: '📄', desc: 'High-fidelity document' },
  { format: 'png', label: 'PNG', icon: '🖼', desc: 'Image screenshot' },
  { format: 'excel', label: 'Excel', icon: '📊', desc: 'Spreadsheet with data' },
  { format: 'csv', label: 'CSV', icon: '📋', desc: 'Comma-separated values' },
];

/* ================================================================== */
/*  SharePanel                                                          */
/* ================================================================== */

export function SharePanel({ dashboard, onUpdate, data }: SharePanelProps) {
  const [activeTab, setActiveTab] = useState<ShareTab>('links');
  const [copied, setCopied] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [newCollabName, setNewCollabName] = useState('');
  const [newCollabEmail, setNewCollabEmail] = useState('');
  const [newCollabRole, setNewCollabRole] = useState<DashboardRole>('viewer');
  const [showAddCollab, setShowAddCollab] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkPassword, setNewLinkPassword] = useState('');
  const [newLinkExpiry, setNewLinkExpiry] = useState('');
  const [embedPreview, setEmbedPreview] = useState('');
  const [showEmbedCode, setShowEmbedCode] = useState(false);

  const shareInfo = useMemo(() => shareManager.getShareInfo(dashboard.id), [dashboard.id]);
  const sharing = shareInfo.sharing;

  /* ---- Visibility ---- */
  const handleVisibility = useCallback((visibility: ShareVisibility) => {
    const patch: Partial<DashboardShare> = { visibility };
    onUpdate({ sharing: { ...sharing, ...patch } });
    shareManager.setSharing(dashboard.id, patch);
  }, [dashboard.id, sharing, onUpdate]);

  /* ---- Password ---- */
  const handleSetPassword = useCallback(async () => {
    await shareManager.setPassword(dashboard.id, passwordInput || undefined);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
    setPasswordInput('');
    setShowPassword(false);
  }, [dashboard.id, passwordInput, onUpdate]);

  /* ---- Links ---- */
  const handleCreateLink = useCallback(async () => {
    const link = await shareManager.createLink(dashboard.id, sharing.visibility, { password: newLinkPassword || undefined, expiresAt: newLinkExpiry || undefined });
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
    setNewLinkPassword('');
    setNewLinkExpiry('');
    setShowAddLink(false);
  }, [dashboard.id, sharing.visibility, newLinkPassword, newLinkExpiry, onUpdate]);

  const handleRemoveLink = useCallback((linkId: string) => {
    shareManager.removeLink(dashboard.id, linkId);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
  }, [dashboard.id, onUpdate]);

  /* ---- Collaborators ---- */
  const handleAddCollaborator = useCallback(() => {
    if (!newCollabName.trim()) return;
    shareManager.addCollaborator(dashboard.id, newCollabName.trim(), newCollabEmail.trim(), newCollabRole);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
    setNewCollabName('');
    setNewCollabEmail('');
    setNewCollabRole('viewer');
    setShowAddCollab(false);
  }, [dashboard.id, newCollabName, newCollabEmail, newCollabRole, onUpdate]);

  const handleRemoveCollaborator = useCallback((collabId: string) => {
    shareManager.removeCollaborator(dashboard.id, collabId);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
  }, [dashboard.id, onUpdate]);

  const handleRoleChange = useCallback((collabId: string, role: DashboardRole) => {
    shareManager.updateCollaboratorRole(dashboard.id, collabId, role);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
  }, [dashboard.id, onUpdate]);

  /* ---- Copy ---- */
  const handleCopy = useCallback(async (text: string, label: string) => {
    const ok = await shareManager.copyToClipboard(text);
    if (ok) { setCopied(label); setTimeout(() => setCopied(''), 2000); }
  }, []);

  /* ---- Embed ---- */
  const handleEmbedToggle = useCallback(() => {
    shareManager.setEmbed(dashboard.id, { enabled: !sharing.embed?.enabled });
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
  }, [dashboard.id, sharing.embed?.enabled, onUpdate]);

  const handleEmbedChange = useCallback((patch: Partial<EmbedSettings>) => {
    shareManager.setEmbed(dashboard.id, patch);
    onUpdate({ sharing: { ...shareManager.getSharing(dashboard.id) } });
  }, [dashboard.id, onUpdate]);

  /* ---- Export ---- */
  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'excel' | 'csv') => {
    await shareManager.exportDashboard(dashboard, format, data);
  }, [dashboard, data]);

  const handlePrint = useCallback(() => { shareManager.print(); }, []);

  const links = sharing.links ?? [];
  const collaborators = sharing.collaborators ?? [];

  return (
    <div className="sp-root">
      {/* ---- Visibility ---- */}
      <div className="sp-section">
        <div className="sp-section-title">Visibility</div>
        <div className="sp-visibility-grid">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button key={opt.value} className={`sp-vis-card ${sharing.visibility === opt.value ? 'active' : ''}`} onClick={() => handleVisibility(opt.value)}>
              <span className="sp-vis-icon">{opt.icon}</span>
              <span className="sp-vis-label">{opt.label}</span>
              <span className="sp-vis-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div className="sp-tabs">
        {([
          { id: 'links' as ShareTab, label: 'Links', count: links.length },
          { id: 'collaborators' as ShareTab, label: 'People', count: collaborators.length },
          { id: 'embed' as ShareTab, label: 'Embed' },
          { id: 'export' as ShareTab, label: 'Export' },
        ]).map((tab) => (
          <button key={tab.id} className={`sp-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.label}{tab.count !== undefined && <span className="sp-tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* ---- Links tab ---- */}
      {activeTab === 'links' && (
        <div className="sp-tab-content">
          <div className="sp-subsection">
            <div className="sp-subsection-header">
              <span className="sp-subsection-title">Share link</span>
              <button className="sp-btn-sm" onClick={() => setShowAddLink(!showAddLink)}>{showAddLink ? 'Cancel' : '+ New link'}</button>
            </div>
            {showAddLink && (
              <div className="sp-form-row">
                <input className="sp-input" type="password" placeholder="Password (optional)" value={newLinkPassword} onChange={(e) => setNewLinkPassword(e.target.value)} />
                <input className="sp-input" type="datetime-local" placeholder="Expires" value={newLinkExpiry} onChange={(e) => setNewLinkExpiry(e.target.value)} />
                <button className="sp-btn sp-btn-primary" onClick={handleCreateLink}>Create</button>
              </div>
            )}
            {links.length === 0 ? (
              <p className="sp-empty-text">No share links yet. Create one to share this dashboard.</p>
            ) : links.map((link) => (
              <div key={link.id} className={`sp-link-row ${link.expiresAt && new Date(link.expiresAt) < new Date() ? 'expired' : ''}`}>
                <div className="sp-link-info">
                  <div className="sp-link-url">{link.url}</div>
                  <div className="sp-link-meta">
                    {link.password && <span className="sp-badge sp-badge-yellow">Password protected</span>}
                    {link.expiresAt && <span className="sp-badge">Expires {new Date(link.expiresAt).toLocaleDateString()}</span>}
                    <span>{link.accessCount} view{link.accessCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="sp-link-actions">
                  <button className="sp-btn-sm" onClick={() => handleCopy(link.url, link.id)}>{copied === link.id ? 'Copied!' : 'Copy'}</button>
                  <button className="sp-btn-sm sp-btn-danger" onClick={() => handleRemoveLink(link.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {/* Public URL */}
          <div className="sp-subsection">
            <div className="sp-subsection-header"><span className="sp-subsection-title">Public URL</span></div>
            <div className="sp-url-row">
              <code className="sp-url">{shareInfo.publicUrl}</code>
              <button className="sp-btn-sm" onClick={() => handleCopy(shareInfo.publicUrl, 'public-url')}>{copied === 'public-url' ? 'Copied!' : 'Copy'}</button>
            </div>
          </div>

          {/* Password */}
          <div className="sp-subsection">
            <div className="sp-subsection-header">
              <span className="sp-subsection-title">Password protection</span>
              <button className="sp-btn-sm" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Cancel' : shareInfo.hasPassword ? 'Change' : 'Set password'}</button>
            </div>
            {showPassword && (
              <div className="sp-form-row">
                <input className="sp-input" type="password" placeholder="Enter password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} />
                <button className="sp-btn sp-btn-primary" onClick={handleSetPassword}>{passwordInput ? 'Set' : 'Remove'}</button>
              </div>
            )}
            {shareInfo.hasPassword && !showPassword && <p className="sp-hint">Password protection is active.</p>}
          </div>
        </div>
      )}

      {/* ---- Collaborators tab ---- */}
      {activeTab === 'collaborators' && (
        <div className="sp-tab-content">
          <div className="sp-subsection">
            <div className="sp-subsection-header">
              <span className="sp-subsection-title">People with access</span>
              <button className="sp-btn-sm" onClick={() => setShowAddCollab(!showAddCollab)}>{showAddCollab ? 'Cancel' : '+ Invite'}</button>
            </div>
            {showAddCollab && (
              <div className="sp-collab-form">
                <input className="sp-input" placeholder="Name" value={newCollabName} onChange={(e) => setNewCollabName(e.target.value)} />
                <input className="sp-input" placeholder="Email" type="email" value={newCollabEmail} onChange={(e) => setNewCollabEmail(e.target.value)} />
                <select className="sp-input" value={newCollabRole} onChange={(e) => setNewCollabRole(e.target.value as DashboardRole)}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button className="sp-btn sp-btn-primary" onClick={handleAddCollaborator}>Invite</button>
              </div>
            )}
            {/* Owner */}
            <div className="sp-collab-row">
              <div className="sp-collab-avatar owner">Y</div>
              <div className="sp-collab-info">
                <span className="sp-collab-name">You</span>
                <span className="sp-collab-email">Owner</span>
              </div>
              <span className="sp-badge sp-badge-blue">Owner</span>
            </div>
            {collaborators.length === 0 && !showAddCollab && (
              <p className="sp-empty-text">No collaborators yet. Invite people to collaborate on this dashboard.</p>
            )}
            {collaborators.map((collab) => (
              <div key={collab.id} className="sp-collab-row">
                <div className="sp-collab-avatar">{collab.name.charAt(0).toUpperCase()}</div>
                <div className="sp-collab-info">
                  <span className="sp-collab-name">{collab.name}</span>
                  <span className="sp-collab-email">{collab.email}</span>
                </div>
                <select className="sp-role-select" value={collab.role} onChange={(e) => handleRoleChange(collab.id, e.target.value as DashboardRole)}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button className="sp-btn-sm sp-btn-danger" onClick={() => handleRemoveCollaborator(collab.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Embed tab ---- */}
      {activeTab === 'embed' && (
        <div className="sp-tab-content">
          <div className="sp-subsection">
            <div className="sp-subsection-header">
              <span className="sp-subsection-title">Embed dashboard</span>
              <button className={`sp-toggle ${sharing.embed?.enabled ? 'active' : ''}`} onClick={handleEmbedToggle}>
                <span className="sp-toggle-knob" />
              </button>
            </div>
            {sharing.embed?.enabled ? (
              <>
                <div className="sp-embed-preview">
                  <div className="sp-embed-browser">
                    <div className="sp-browser-bar">
                      <span className="sp-browser-dot" /><span className="sp-browser-dot" /><span className="sp-browser-dot" />
                      <span className="sp-browser-url">{shareInfo.embedUrl}</span>
                    </div>
                    <div className="sp-embed-frame">
                      <div className="sp-embed-placeholder">Dashboard preview</div>
                    </div>
                  </div>
                </div>
                <div className="sp-embed-options">
                  <div className="sp-form-row">
                    <div className="sp-field"><label>Width</label><input className="sp-input" type="number" value={sharing.embed?.width ?? 800} onChange={(e) => handleEmbedChange({ width: Number(e.target.value) || 800 })} min={200} max={2000} /></div>
                    <div className="sp-field"><label>Height</label><input className="sp-input" type="number" value={sharing.embed?.height ?? 600} onChange={(e) => handleEmbedChange({ height: Number(e.target.value) || 600 })} min={200} max={2000} /></div>
                    <div className="sp-field"><label>Theme</label><select className="sp-input" value={sharing.embed?.theme ?? 'light'} onChange={(e) => handleEmbedChange({ theme: e.target.value as 'light' | 'dark' | 'auto' })}><option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto</option></select></div>
                  </div>
                  <div className="sp-embed-toggles">
                    <label className="sp-check"><input type="checkbox" checked={sharing.embed?.showHeader !== false} onChange={(e) => handleEmbedChange({ showHeader: e.target.checked })} /> Show header</label>
                    <label className="sp-check"><input type="checkbox" checked={sharing.embed?.showFilters !== false} onChange={(e) => handleEmbedChange({ showFilters: e.target.checked })} /> Show filters</label>
                  </div>
                  <div className="sp-field"><label>Allowed domains</label><input className="sp-input" placeholder="example.com, app.example.com" value={sharing.embed?.allowedDomains?.join(', ') ?? ''} onChange={(e) => handleEmbedChange({ allowedDomains: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
                </div>
                <div className="sp-code-section">
                  <div className="sp-code-header">
                    <span>Embed code</span>
                    <button className="sp-btn-sm" onClick={() => handleCopy(shareInfo.embedCode, 'embed-code')}>{copied === 'embed-code' ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <pre className="sp-code">{shareInfo.embedCode || '<!-- Enable embed to generate code -->'}</pre>
                </div>
              </>
            ) : (
              <p className="sp-empty-text">Enable embedding to get an iframe code you can paste into any webpage.</p>
            )}
          </div>
        </div>
      )}

      {/* ---- Export tab ---- */}
      {activeTab === 'export' && (
        <div className="sp-tab-content">
          <div className="sp-subsection">
            <div className="sp-subsection-header"><span className="sp-subsection-title">Export dashboard</span></div>
            <div className="sp-export-grid">
              {EXPORT_FORMATS.map((fmt) => (
                <button key={fmt.format} className="sp-export-card" onClick={() => handleExport(fmt.format)}>
                  <span className="sp-export-icon">{fmt.icon}</span>
                  <span className="sp-export-label">{fmt.label}</span>
                  <span className="sp-export-desc">{fmt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sp-subsection">
            <div className="sp-subsection-header"><span className="sp-subsection-title">Print</span></div>
            <button className="sp-btn sp-btn-print" onClick={handlePrint}>🖨 Print dashboard</button>
            <p className="sp-hint">Opens the browser print dialog for a print-optimized layout.</p>
          </div>
          <div className="sp-subsection">
            <div className="sp-subsection-header"><span className="sp-subsection-title">Export permissions</span></div>
            <div className="sp-perm-toggles">
              <label className="sp-check"><input type="checkbox" checked={sharing.allowExport !== false} onChange={(e) => { onUpdate({ sharing: { ...sharing, allowExport: e.target.checked } }); shareManager.setSharing(dashboard.id, { allowExport: e.target.checked }); }} /> Allow data export</label>
              <label className="sp-check"><input type="checkbox" checked={sharing.allowPrint !== false} onChange={(e) => { onUpdate({ sharing: { ...sharing, allowPrint: e.target.checked } }); shareManager.setSharing(dashboard.id, { allowPrint: e.target.checked }); }} /> Allow printing</label>
              <label className="sp-check"><input type="checkbox" checked={sharing.allowDownload !== false} onChange={(e) => { onUpdate({ sharing: { ...sharing, allowDownload: e.target.checked } }); shareManager.setSharing(dashboard.id, { allowDownload: e.target.checked }); }} /> Allow downloads</label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
