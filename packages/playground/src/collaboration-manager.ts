import type { CollabUser, PresenceState, Comment, CommentStatus, CommentTarget, ActivityEntry, ActivityAction, AuditEntry, AuditSeverity, Notification, NotificationType, NotificationPriority, ApprovalRequest, ApprovalScope, ApprovalStatus, ConflictInfo, ConflictType, ConflictResolution, CollaborationLock, CollabEvent, CollabEventType, CollabChannel } from '@dashboard-generator/core';
import { readJson, writeJson, now, uid, CHART_COLORS } from './utils';

/* ================================================================== */
/*  Storage keys                                                       */
/* ================================================================== */

const KEYS = {
  comments: 'dg:collab:comments:v1',
  activity: 'dg:collab:activity:v1',
  audit: 'dg:collab:audit:v1',
  notifications: 'dg:collab:notifications:v1',
  approvals: 'dg:collab:approvals:v1',
  conflicts: 'dg:collab:conflicts:v1',
  locks: 'dg:collab:locks:v1',
  presence: 'dg:collab:presence:v1',
  users: 'dg:collab:users:v1',
} as const;

const pickColor = () => CHART_COLORS[Math.floor(Math.random() * CHART_COLORS.length)];

/* ================================================================== */
/*  Current user (simulated)                                           */
/* ================================================================== */

const CURRENT_USER_KEY = 'dg:collab:current-user:v1';

function getCurrentUser(): CollabUser {
  let user = readJson<CollabUser | null>(CURRENT_USER_KEY, null);
  if (!user) {
    user = { id: `user-${uid()}`, name: 'You', email: 'you@example.com', color: pickColor() };
    writeJson(CURRENT_USER_KEY, user);
  }
  return user;
}

function ensureUsers(): CollabUser[] {
  const users = readJson<CollabUser[]>(KEYS.users, []);
  if (users.length === 0) {
    const simulated: CollabUser[] = [
      { id: 'user-alice', name: 'Alice Chen', email: 'alice@example.com', color: '#3b82f6' },
      { id: 'user-bob', name: 'Bob Martinez', email: 'bob@example.com', color: '#10b981' },
      { id: 'user-carol', name: 'Carol Kim', email: 'carol@example.com', color: '#f59e0b' },
      { id: 'user-dave', name: 'Dave Patel', email: 'dave@example.com', color: '#8b5cf6' },
    ];
    writeJson(KEYS.users, simulated);
    return simulated;
  }
  return users;
}

/* ================================================================== */
/*  Event bus                                                          */
/* ================================================================== */

type Listener = (event: CollabEvent) => void;
const listeners = new Map<string, Set<Listener>>();

function emitLocal(event: CollabEvent) {
  const key = event.dashboardId;
  listeners.get(key)?.forEach((fn) => fn(event));
}

/* ================================================================== */
/*  collaborationManager                                               */
/* ================================================================== */

export const collaborationManager = {
  currentUser: getCurrentUser(),

  getAllUsers(): CollabUser[] {
    return [getCurrentUser(), ...ensureUsers()];
  },

  getUser(id: string): CollabUser | undefined {
    return this.getAllUsers().find((u) => u.id === id);
  },

  /* ================================================================== */
  /*  Presence                                                           */
  /* ================================================================== */

  updatePresence(dashboardId: string, patch: Partial<Omit<PresenceState, 'userId' | 'dashboardId'>>): void {
    const all = readJson<PresenceState[]>(KEYS.presence, []);
    const userId = getCurrentUser().id;
    const idx = all.findIndex((p) => p.userId === userId && p.dashboardId === dashboardId);
    const state: PresenceState = {
      userId,
      dashboardId,
      status: 'online',
      lastSeen: now(),
      ...patch,
      ...(idx >= 0 ? all[idx] : {}),
    };
    if (idx >= 0) all[idx] = { ...all[idx], ...state };
    else all.push(state);
    writeJson(KEYS.presence, all);
    emitLocal({ type: 'presence_update', userId, dashboardId, timestamp: now(), payload: state });
  },

  getPresence(dashboardId: string): PresenceState[] {
    const all = readJson<PresenceState[]>(KEYS.presence, []);
    const cutoff = Date.now() - 5 * 60 * 1000;
    return all.filter((p) => p.dashboardId === dashboardId && new Date(p.lastSeen).getTime() > cutoff);
  },

  getOnlineCount(dashboardId: string): number {
    return this.getPresence(dashboardId).filter((p) => p.status === 'online').length;
  },

  leavePresence(dashboardId: string): void {
    this.updatePresence(dashboardId, { status: 'offline' });
  },

  /* ================================================================== */
  /*  Comments                                                           */
  /* ================================================================== */

  addComment(dashboardId: string, content: string, target: CommentTarget = 'dashboard', targetId?: string, parentId?: string): Comment {
    const comments = readJson<Comment[]>(KEYS.comments, []);
    const user = getCurrentUser();
    const mentions = this.parseMentions(content);
    const comment: Comment = {
      id: uid(),
      dashboardId,
      author: user,
      target,
      targetId,
      content,
      mentions,
      reactions: [],
      status: 'open',
      parentId,
      createdAt: now(),
      updatedAt: now(),
    };
    comments.push(comment);
    writeJson(KEYS.comments, comments);
    this.logActivity(dashboardId, 'comment', 'comment', comment.id, content.slice(0, 50));
    this.logAudit(dashboardId, 'comment.add', 'info', { commentId: comment.id, target, targetId, content: content.slice(0, 100) });
    mentions.forEach((m) => {
      if (m.userId !== user.id) {
        this.addNotification({
          type: 'mention',
          priority: 'high',
          title: `${user.name} mentioned you`,
          message: content.slice(0, 120),
          dashboardId,
          fromUser: user,
        });
      }
    });
    emitLocal({ type: 'comment_add', userId: user.id, dashboardId, timestamp: now(), payload: comment });
    return comment;
  },

  updateComment(commentId: string, patch: Partial<Pick<Comment, 'content' | 'status'>>): Comment | undefined {
    const comments = readJson<Comment[]>(KEYS.comments, []);
    const idx = comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return undefined;
    comments[idx] = { ...comments[idx], ...patch, updatedAt: now() };
    if (patch.status === 'resolved') { comments[idx].resolvedBy = getCurrentUser().id; comments[idx].resolvedAt = now(); }
    writeJson(KEYS.comments, comments);
    if (patch.status) emitLocal({ type: 'comment_resolve', userId: getCurrentUser().id, dashboardId: comments[idx].dashboardId, timestamp: now(), payload: comments[idx] });
    return comments[idx];
  },

  resolveComment(commentId: string): Comment | undefined {
    return this.updateComment(commentId, { status: 'resolved' });
  },

  getComments(dashboardId: string, filter?: { status?: CommentStatus; target?: CommentTarget; targetId?: string }): Comment[] {
    const comments = readJson<Comment[]>(KEYS.comments, []);
    return comments.filter((c) => {
      if (c.dashboardId !== dashboardId) return false;
      if (filter?.status && c.status !== filter.status) return false;
      if (filter?.target && c.target !== filter.target) return false;
      if (filter?.targetId && c.targetId !== filter.targetId) return false;
      return true;
    }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  getCommentThreads(dashboardId: string): Comment[] {
    return this.getComments(dashboardId, { status: 'open' }).filter((c) => !c.parentId);
  },

  getReplies(parentId: string): Comment[] {
    const comments = readJson<Comment[]>(KEYS.comments, []);
    return comments.filter((c) => c.parentId === parentId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  addReaction(commentId: string, emoji: string): void {
    const comments = readJson<Comment[]>(KEYS.comments, []);
    const c = comments.find((x) => x.id === commentId);
    if (!c) return;
    const existing = c.reactions.findIndex((r) => r.emoji === emoji && r.userId === getCurrentUser().id);
    if (existing >= 0) c.reactions.splice(existing, 1);
    else c.reactions.push({ emoji, userId: getCurrentUser().id, createdAt: now() });
    writeJson(KEYS.comments, comments);
  },

  parseMentions(content: string): { userId: string; name: string; offset: number; length: number }[] {
    const mentions: { userId: string; name: string; offset: number; length: number }[] = [];
    const regex = /@(\w+)/g;
    let match;
    const users = this.getAllUsers();
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const user = users.find((u) => u.name.toLowerCase().startsWith(name.toLowerCase()));
      if (user) mentions.push({ userId: user.id, name: user.name, offset: match.index, length: match[0].length });
    }
    return mentions;
  },

  /* ================================================================== */
  /*  Activity Timeline                                                  */
  /* ================================================================== */

  logActivity(dashboardId: string, action: ActivityAction, targetType: ActivityEntry['targetType'], targetId?: string, targetName?: string, details?: Record<string, unknown>): ActivityEntry {
    const activities = readJson<ActivityEntry[]>(KEYS.activity, []);
    const entry: ActivityEntry = {
      id: uid(),
      dashboardId,
      user: getCurrentUser(),
      action,
      targetType,
      targetId,
      targetName,
      details,
      timestamp: now(),
    };
    activities.push(entry);
    if (activities.length > 500) activities.splice(0, activities.length - 500);
    writeJson(KEYS.activity, activities);
    return entry;
  },

  getActivities(dashboardId: string, limit = 50): ActivityEntry[] {
    return readJson<ActivityEntry[]>(KEYS.activity, [])
      .filter((a) => a.dashboardId === dashboardId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  },

  /* ================================================================== */
  /*  Audit Log                                                          */
  /* ================================================================== */

  logAudit(dashboardId: string, action: string, severity: AuditSeverity, details: Record<string, unknown>): AuditEntry {
    const log = readJson<AuditEntry[]>(KEYS.audit, []);
    const entry: AuditEntry = {
      id: uid(),
      dashboardId,
      user: getCurrentUser(),
      action,
      severity,
      details,
      timestamp: now(),
    };
    log.push(entry);
    if (log.length > 1000) log.splice(0, log.length - 1000);
    writeJson(KEYS.audit, log);
    return entry;
  },

  getAuditLog(dashboardId: string, limit = 100): AuditEntry[] {
    return readJson<AuditEntry[]>(KEYS.audit, [])
      .filter((a) => a.dashboardId === dashboardId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  },

  /* ================================================================== */
  /*  Notifications                                                      */
  /* ================================================================== */

  addNotification(partial: { type: NotificationType; priority?: NotificationPriority; title: string; message: string; dashboardId?: string; dashboardName?: string; fromUser?: CollabUser }): Notification {
    const notifications = readJson<Notification[]>(KEYS.notifications, []);
    const notification: Notification = {
      id: uid(),
      type: partial.type,
      priority: partial.priority ?? 'normal',
      title: partial.title,
      message: partial.message,
      dashboardId: partial.dashboardId,
      dashboardName: partial.dashboardName,
      fromUser: partial.fromUser,
      read: false,
      createdAt: now(),
    };
    notifications.unshift(notification);
    if (notifications.length > 200) notifications.length = 200;
    writeJson(KEYS.notifications, notifications);
    emitLocal({ type: 'notification', userId: getCurrentUser().id, dashboardId: partial.dashboardId ?? '', timestamp: now(), payload: notification });
    return notification;
  },

  getNotifications(unreadOnly = false): Notification[] {
    const notifications = readJson<Notification[]>(KEYS.notifications, []);
    return unreadOnly ? notifications.filter((n) => !n.read) : notifications;
  },

  getUnreadCount(): number {
    return this.getNotifications(true).length;
  },

  markRead(notificationId: string): void {
    const notifications = readJson<Notification[]>(KEYS.notifications, []);
    const n = notifications.find((x) => x.id === notificationId);
    if (n) { n.read = true; writeJson(KEYS.notifications, notifications); }
  },

  markAllRead(): void {
    const notifications = readJson<Notification[]>(KEYS.notifications, []);
    notifications.forEach((n) => { n.read = true; });
    writeJson(KEYS.notifications, notifications);
  },

  dismissNotification(notificationId: string): void {
    const notifications = readJson<Notification[]>(KEYS.notifications, []);
    writeJson(KEYS.notifications, notifications.filter((n) => n.id !== notificationId));
  },

  /* ================================================================== */
  /*  Approval Workflow                                                  */
  /* ================================================================== */

  createApproval(dashboardId: string, scope: ApprovalScope, title: string, description?: string, reviewerIds?: string[]): ApprovalRequest {
    const approvals = readJson<ApprovalRequest[]>(KEYS.approvals, []);
    const user = getCurrentUser();
    const users = this.getAllUsers();
    const reviewers = (reviewerIds ?? users.filter((u) => u.id !== user.id).slice(0, 2).map((u) => u.id))
      .map((id) => ({ userId: id, name: users.find((u) => u.id === id)?.name ?? id, status: 'pending' as const }));
    const request: ApprovalRequest = {
      id: uid(),
      dashboardId,
      requester: user,
      scope,
      title,
      description,
      status: 'pending',
      reviewers,
      createdAt: now(),
      updatedAt: now(),
    };
    approvals.push(request);
    writeJson(KEYS.approvals, approvals);
    this.logActivity(dashboardId, 'approve', 'version', request.id, title);
    this.logAudit(dashboardId, 'approval.create', 'info', { approvalId: request.id, scope, title });
    reviewers.forEach((r) => {
      this.addNotification({ type: 'approval_request', priority: 'high', title: `Approval requested: ${title}`, message: description ?? `${user.name} requests approval for "${title}"`, dashboardId, fromUser: user });
    });
    return request;
  },

  reviewApproval(requestId: string, status: Exclude<ApprovalStatus, 'pending' | 'cancelled'>, comment?: string): ApprovalRequest | undefined {
    const approvals = readJson<ApprovalRequest[]>(KEYS.approvals, []);
    const request = approvals.find((a) => a.id === requestId);
    if (!request) return undefined;
    const user = getCurrentUser();
    const reviewer = request.reviewers.find((r) => r.userId === user.id);
    if (reviewer) { reviewer.status = status; reviewer.comment = comment; reviewer.reviewedAt = now(); }
    const allDecided = request.reviewers.every((r) => r.status !== 'pending');
    if (allDecided) {
      const anyRejected = request.reviewers.some((r) => r.status === 'rejected');
      const anyChanges = request.reviewers.some((r) => r.status === 'changes_requested');
      request.status = anyRejected ? 'rejected' : anyChanges ? 'changes_requested' : 'approved';
      request.decision = { status: request.status as Exclude<ApprovalStatus, 'pending'>, comment, decidedBy: user, decidedAt: now() };
    }
    request.updatedAt = now();
    writeJson(KEYS.approvals, approvals);
    this.logAudit(request.dashboardId, `approval.${status}`, status === 'rejected' ? 'warning' : 'info', { requestId, comment });
    this.addNotification({ type: 'approval_decision', priority: status === 'rejected' ? 'high' : 'normal', title: `Approval ${status}`, message: comment ?? `Your request "${request.title}" was ${status}`, dashboardId: request.dashboardId, fromUser: user });
    return request;
  },

  getApprovals(dashboardId: string, status?: ApprovalStatus): ApprovalRequest[] {
    return readJson<ApprovalRequest[]>(KEYS.approvals, [])
      .filter((a) => a.dashboardId === dashboardId && (!status || a.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  getPendingApprovals(): ApprovalRequest[] {
    return readJson<ApprovalRequest[]>(KEYS.approvals, []).filter((a) => a.status === 'pending');
  },

  cancelApproval(requestId: string): void {
    const approvals = readJson<ApprovalRequest[]>(KEYS.approvals, []);
    const request = approvals.find((a) => a.id === requestId);
    if (request) { request.status = 'cancelled'; request.updatedAt = now(); writeJson(KEYS.approvals, approvals); }
  },

  /* ================================================================== */
  /*  Conflict Detection                                                 */
  /* ================================================================== */

  detectConflict(dashboardId: string, localVersion: number, remoteVersion: number, remoteUser: CollabUser, affectedFields: string[]): ConflictInfo | null {
    if (localVersion >= remoteVersion) return null;
    const conflicts = readJson<ConflictInfo[]>(KEYS.conflicts, []);
    const existing = conflicts.find((c) => c.dashboardId === dashboardId && !c.resolved);
    if (existing) return existing;
    const conflict: ConflictInfo = {
      id: uid(),
      dashboardId,
      type: 'concurrent_edit',
      localVersion,
      remoteVersion,
      localUser: getCurrentUser(),
      remoteUser,
      affectedFields,
      detectedAt: now(),
    };
    conflicts.push(conflict);
    writeJson(KEYS.conflicts, conflicts);
    this.logAudit(dashboardId, 'conflict.detected', 'warning', { conflictId: conflict.id, remoteUser: remoteUser.name, fields: affectedFields });
    emitLocal({ type: 'conflict_detected', userId: getCurrentUser().id, dashboardId, timestamp: now(), payload: conflict });
    return conflict;
  },

  resolveConflict(conflictId: string, resolution: ConflictResolution): void {
    const conflicts = readJson<ConflictInfo[]>(KEYS.conflicts, []);
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;
    conflict.resolved = { resolution, resolvedBy: getCurrentUser(), resolvedAt: now() };
    writeJson(KEYS.conflicts, conflicts);
    this.logAudit(conflict.dashboardId, 'conflict.resolved', 'info', { conflictId, resolution });
  },

  getUnresolvedConflicts(dashboardId: string): ConflictInfo[] {
    return readJson<ConflictInfo[]>(KEYS.conflicts, []).filter((c) => c.dashboardId === dashboardId && !c.resolved);
  },

  /* ================================================================== */
  /*  Locks                                                              */
  /* ================================================================== */

  acquireLock(dashboardId: string, resource?: string): CollaborationLock | null {
    const locks = readJson<CollaborationLock[]>(KEYS.locks, []);
    const user = getCurrentUser();
    const existing = locks.find((l) => l.dashboardId === dashboardId && l.userId !== user.id && new Date(l.expiresAt) > new Date());
    if (existing) return existing;
    const myIdx = locks.findIndex((l) => l.dashboardId === dashboardId && l.userId === user.id);
    const lock: CollaborationLock = { dashboardId, userId: user.id, userName: user.name, lockedAt: now(), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), resource };
    if (myIdx >= 0) locks[myIdx] = lock; else locks.push(lock);
    writeJson(KEYS.locks, locks);
    emitLocal({ type: 'lock_acquired', userId: user.id, dashboardId, timestamp: now(), payload: lock });
    return null;
  },

  releaseLock(dashboardId: string): void {
    const locks = readJson<CollaborationLock[]>(KEYS.locks, []);
    const user = getCurrentUser();
    writeJson(KEYS.locks, locks.filter((l) => !(l.dashboardId === dashboardId && l.userId === user.id)));
    emitLocal({ type: 'lock_released', userId: user.id, dashboardId, timestamp: now(), payload: {} });
  },

  getLocks(dashboardId: string): CollaborationLock[] {
    return readJson<CollaborationLock[]>(KEYS.locks, []).filter((l) => l.dashboardId === dashboardId && new Date(l.expiresAt) > new Date());
  },

  /* ================================================================== */
  /*  Live Channel (EventBus-based simulation)                           */
  /* ================================================================== */

  createChannel(dashboardId: string): CollabChannel {
    const channelListeners = new Set<Listener>();
    listeners.set(dashboardId, channelListeners);
    return {
      dashboardId,
      subscribe(callback: (event: CollabEvent) => void): () => void {
        channelListeners.add(callback);
        return () => { channelListeners.delete(callback); };
      },
      emit(event: Omit<CollabEvent, 'timestamp'>): void {
        const fullEvent: CollabEvent = { ...event, timestamp: now() };
        emitLocal(fullEvent);
      },
    };
  },

  /* ================================================================== */
  /*  Simulated collaboration (demo purposes)                            */
  /* ================================================================== */

  simulatePresence(dashboardId: string): void {
    const users = ensureUsers().slice(0, 3);
    const all = readJson<PresenceState[]>(KEYS.presence, []);
    users.forEach((user, i) => {
      const idx = all.findIndex((p) => p.userId === user.id && p.dashboardId === dashboardId);
      const state: PresenceState = {
        userId: user.id,
        dashboardId,
        status: i === 0 ? 'online' : i === 1 ? 'idle' : Math.random() > 0.5 ? 'online' : 'offline',
        cursor: { x: 100 + Math.random() * 800, y: 100 + Math.random() * 400 },
        selectedWidgetIds: i === 0 ? ['w1'] : undefined,
        activePanel: i === 1 ? 'inspector' : undefined,
        lastSeen: now(),
      };
      if (idx >= 0) all[idx] = { ...all[idx], ...state }; else all.push(state);
    });
    writeJson(KEYS.presence, all);
  },
};
