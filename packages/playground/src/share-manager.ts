import type { DashboardConfig, DashboardShare, DashboardRole, ShareCollaborator, ShareLink, ShareVisibility, EmbedSettings, ExportFormat, DataRecord } from '@dashboard-generator/core';
import { readJson, writeJson, now, secureToken } from './utils';

/* ================================================================== */
/*  Storage keys                                                       */
/* ================================================================== */

const SHARE_KEY = 'dashboard-generator:shares:v1';
const generateToken = (): string => secureToken(32);
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `pwd_${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
};
const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://dashboard.app';

/* ================================================================== */
/*  Share store                                                         */
/* ================================================================== */

type ShareStore = Record<string, DashboardShare>;
const readShares = (): ShareStore => readJson(SHARE_KEY, {});
const writeShares = (store: ShareStore) => writeJson(SHARE_KEY, store);

/* ================================================================== */
/*  shareManager                                                        */
/* ================================================================== */

export const shareManager = {
  /* ---- Get / Set sharing config ---- */

  getSharing(dashboardId: string): DashboardShare {
    return readShares()[dashboardId] ?? { visibility: 'private' };
  },

  setSharing(dashboardId: string, patch: Partial<DashboardShare>): DashboardShare {
    const shares = readShares();
    const current = shares[dashboardId] ?? { visibility: 'private' as const };
    shares[dashboardId] = { ...current, ...patch };
    writeShares(shares);
    return shares[dashboardId];
  },

  /* ---- Visibility ---- */

  setVisibility(dashboardId: string, visibility: ShareVisibility): DashboardShare {
    return this.setSharing(dashboardId, { visibility });
  },

  /* ---- Password protection ---- */

  async setPassword(dashboardId: string, password: string | undefined): Promise<DashboardShare> {
    return this.setSharing(dashboardId, { password: password ? await hashPassword(password) : undefined });
  },

  async verifyPassword(dashboardId: string, password: string): Promise<boolean> {
    const share = this.getSharing(dashboardId);
    if (!share.password) return true;
    const hash = await hashPassword(password);
    return share.password === hash;
  },

  /* ---- Expiration ---- */

  setExpiration(dashboardId: string, expiresAt: string | undefined): DashboardShare {
    return this.setSharing(dashboardId, { expiresAt });
  },

  isExpired(dashboardId: string): boolean {
    const share = this.getSharing(dashboardId);
    if (!share.expiresAt) return false;
    return new Date(share.expiresAt) < new Date();
  },

  /* ---- Collaborators ---- */

  addCollaborator(dashboardId: string, name: string, email: string, role: DashboardRole): ShareCollaborator {
    const share = this.getSharing(dashboardId);
    const collaborators = share.collaborators ?? [];
    const collaborator: ShareCollaborator = { id: `collab-${Date.now()}`, name, email, role, addedAt: now() };
    collaborators.push(collaborator);
    this.setSharing(dashboardId, { collaborators });
    return collaborator;
  },

  removeCollaborator(dashboardId: string, collaboratorId: string): void {
    const share = this.getSharing(dashboardId);
    const collaborators = (share.collaborators ?? []).filter((c) => c.id !== collaboratorId);
    this.setSharing(dashboardId, { collaborators });
  },

  updateCollaboratorRole(dashboardId: string, collaboratorId: string, role: DashboardRole): void {
    const share = this.getSharing(dashboardId);
    const collaborators = (share.collaborators ?? []).map((c) => c.id === collaboratorId ? { ...c, role } : c);
    this.setSharing(dashboardId, { collaborators });
  },

  /* ---- Share links ---- */

  async createLink(dashboardId: string, visibility: ShareVisibility, options?: { password?: string; expiresAt?: string }): Promise<ShareLink> {
    const share = this.getSharing(dashboardId);
    const links = share.links ?? [];
    const token = generateToken();
    const link: ShareLink = {
      id: `link-${Date.now()}`,
      token,
      url: `${BASE_URL}/share/${token}`,
      visibility,
      password: options?.password ? await hashPassword(options.password) : undefined,
      expiresAt: options?.expiresAt,
      createdAt: now(),
      accessCount: 0,
    };
    links.push(link);
    this.setSharing(dashboardId, { links });
    return link;
  },

  removeLink(dashboardId: string, linkId: string): void {
    const share = this.getSharing(dashboardId);
    const links = (share.links ?? []).filter((l) => l.id !== linkId);
    this.setSharing(dashboardId, { links });
  },

  getLink(token: string): { dashboardId: string; link: ShareLink } | undefined {
    const shares = readShares();
    for (const [dashboardId, share] of Object.entries(shares)) {
      const link = (share.links ?? []).find((l) => l.token === token);
      if (link) {
        link.accessCount++;
        link.lastAccessedAt = now();
        writeShares(shares);
        return { dashboardId, link };
      }
    }
    return undefined;
  },

  isLinkValid(dashboardId: string, linkId: string): boolean {
    const share = this.getSharing(dashboardId);
    const link = (share.links ?? []).find((l) => l.id === linkId);
    if (!link) return false;
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return false;
    return true;
  },

  /* ---- Embed settings ---- */

  setEmbed(dashboardId: string, settings: Partial<EmbedSettings>): DashboardShare {
    const share = this.getSharing(dashboardId);
    const embed = { ...share.embed, ...settings };
    return this.setSharing(dashboardId, { embed });
  },

  getEmbedCode(dashboardId: string): string {
    const share = this.getSharing(dashboardId);
    const embed = share.embed ?? { enabled: false };
    if (!embed.enabled) return '';
    const width = embed.width ?? 800;
    const height = embed.height ?? 600;
    const theme = embed.theme ?? 'light';
    const src = `${BASE_URL}/embed/${dashboardId}?theme=${theme}`;
    const attrs = [`src="${src}"`, `width="${width}"`, `height="${height}"`, 'frameborder="0"', 'allowfullscreen'];
    if (embed.allowedDomains?.length) attrs.push(`data-allowed-domains="${embed.allowedDomains.join(',')}"`);
    return `<iframe ${attrs.join(' ')}></iframe>`;
  },

  /* ---- Export ---- */

  async exportDashboard(config: DashboardConfig, format: ExportFormat, data?: DataRecord[]): Promise<void> {
    switch (format) {
      case 'pdf': await this.exportPdf(config); break;
      case 'png': await this.exportPng(config); break;
      case 'excel': this.exportExcel(data ?? []); break;
      case 'csv': this.exportCsv(data ?? []); break;
    }
  },

  async exportPdf(config: DashboardConfig): Promise<void> {
    const el = document.querySelector('[data-dashboard-id="' + config.id + '"]') ?? document.querySelector('.pg-workspace');
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');
      const canvas = await html2canvas(el as HTMLElement, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${config.title || 'dashboard'}.pdf`);
    } catch {
      window.print();
    }
  },

  async exportPng(config: DashboardConfig): Promise<void> {
    const el = document.querySelector('[data-dashboard-id="' + config.id + '"]') ?? document.querySelector('.pg-workspace');
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el as HTMLElement, { scale: 2, useCORS: true });
      const link = document.createElement('a');
      link.download = `${config.title || 'dashboard'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch { /* silent */ }
  },

  exportExcel(data: DataRecord[]): void {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map((row) => headers.map((h) => String(row[h] ?? '')).join('\t'));
    const content = [headers.join('\t'), ...rows].join('\n');
    const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.download = 'dashboard-data.xls';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  },

  exportCsv(data: DataRecord[]): void {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const escape = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
    const rows = data.map((row) => headers.map((h) => escape(String(row[h] ?? ''))).join(','));
    const content = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = 'dashboard-data.csv';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  },

  print(): void {
    window.print();
  },

  /* ---- Public link resolution ---- */

  async getPublicShareUrl(dashboardId: string): Promise<string> {
    const share = this.getSharing(dashboardId);
    if (share.visibility === 'link') {
      const existing = (share.links ?? []).find((l) => l.visibility === 'link');
      if (existing && this.isLinkValid(dashboardId, existing.id)) return existing.url;
      const link = await this.createLink(dashboardId, 'link');
      return link.url;
    }
    return `${BASE_URL}/dashboards/${dashboardId}`;
  },

  getEmbedUrl(dashboardId: string): string {
    return `${BASE_URL}/embed/${dashboardId}`;
  },

  /* ---- Copy to clipboard ---- */

  async copyToClipboard(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  },

  /* ---- Get all sharing info for a dashboard ---- */

  getShareInfo(dashboardId: string): {
    sharing: DashboardShare;
    publicUrl: string;
    embedCode: string;
    embedUrl: string;
    hasPassword: boolean;
    isExpired: boolean;
    collaboratorCount: number;
    linkCount: number;
  } {
    const sharing = this.getSharing(dashboardId);
    return {
      sharing,
      publicUrl: this.getPublicShareUrl(dashboardId),
      embedCode: this.getEmbedCode(dashboardId),
      embedUrl: this.getEmbedUrl(dashboardId),
      hasPassword: !!sharing.password,
      isExpired: this.isExpired(dashboardId),
      collaboratorCount: (sharing.collaborators ?? []).length,
      linkCount: (sharing.links ?? []).length,
    };
  },
};
