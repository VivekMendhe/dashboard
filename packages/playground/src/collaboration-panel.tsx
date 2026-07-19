import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Comment, CommentStatus, ApprovalRequest, ApprovalStatus, CollabEvent } from '@dashboard-generator/core';
import { collaborationManager } from './collaboration-manager';
import { timeAgo, statusColor } from './utils';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface CollaborationPanelProps {
  dashboardId: string;
  dashboardTitle?: string;
}

type CollabTab = 'comments' | 'activity' | 'notifications' | 'approvals' | 'audit';

/* ================================================================== */
/*  Helpers                                                             */
/* ================================================================== */

const ACTION_ICONS: Record<string, string> = { create: '+', update: '~', delete: 'x', move: '>', resize: '<>', comment: 'c', publish: 'P', archive: 'A', restore: 'R', share: 'S', approve: 'V', rollback: 'B', import: 'I', export: 'E' };
const STATUS_COLORS: Record<string, string> = { open: '#f59e0b', resolved: '#10b981', archived: '#6b7280', pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', cancelled: '#6b7280', changes_requested: '#f59e0b' };
const NOTIF_ICONS: Record<string, string> = { mention: '@', comment: 'c', reply: 'r', approval_request: 'A', approval_decision: 'V', share_invite: 'S', publish: 'P', system: '*' };
const PRIORITY_DOTS: Record<string, string> = { low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

function renderCommentContent(content: string, mentions: { userId: string; name: string; offset: number; length: number }[]): React.ReactNode {
  if (mentions.length === 0) return content;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  mentions.forEach((m) => {
    if (m.offset > lastIdx) parts.push(content.slice(lastIdx, m.offset));
    parts.push(<span key={m.userId + m.offset} className="collab-mention">@{m.name}</span>);
    lastIdx = m.offset + m.length;
  });
  if (lastIdx < content.length) parts.push(content.slice(lastIdx));
  return parts;
}

/* ================================================================== */
/*  CollaborationPanel                                                  */
/* ================================================================== */

export function CollaborationPanel({ dashboardId }: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<CollabTab>('comments');
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [commentFilter, setCommentFilter] = useState<CommentStatus | 'all'>('all');
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalDesc, setApprovalDesc] = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  const user = collaborationManager.currentUser;
  const presence = useMemo(() => collaborationManager.getPresence(dashboardId), [dashboardId, activeTab]);
  const comments = useMemo(() => collaborationManager.getComments(dashboardId, commentFilter !== 'all' ? { status: commentFilter } : undefined), [dashboardId, commentFilter]);
  const threads = useMemo(() => comments.filter((c) => !c.parentId), [comments]);
  const activities = useMemo(() => collaborationManager.getActivities(dashboardId), [dashboardId, activeTab]);
  const notifications = useMemo(() => collaborationManager.getNotifications(), [activeTab]);
  const unreadCount = useMemo(() => collaborationManager.getUnreadCount(), [notifications]);
  const approvals = useMemo(() => collaborationManager.getApprovals(dashboardId), [dashboardId, activeTab]);
  const auditLog = useMemo(() => collaborationManager.getAuditLog(dashboardId), [dashboardId, activeTab]);
  const conflicts = useMemo(() => collaborationManager.getUnresolvedConflicts(dashboardId), [dashboardId]);

  useEffect(() => {
    collaborationManager.simulatePresence(dashboardId);
    collaborationManager.updatePresence(dashboardId, { status: 'online' });
    return () => { collaborationManager.leavePresence(dashboardId); };
  }, [dashboardId]);

  useEffect(() => {
    const channel = collaborationManager.createChannel(dashboardId);
    const unsub = channel.subscribe((_evt: CollabEvent) => { refresh(); });
    return () => unsub();
  }, [dashboardId, refresh]);

  const handlePostComment = useCallback(() => { if (!newComment.trim()) return; collaborationManager.addComment(dashboardId, newComment.trim()); setNewComment(''); refresh(); }, [dashboardId, newComment, refresh]);
  const handleReply = useCallback((parentId: string) => { if (!replyContent.trim()) return; collaborationManager.addComment(dashboardId, replyContent.trim(), 'dashboard', undefined, parentId); setReplyContent(''); setReplyTo(null); refresh(); }, [dashboardId, replyContent, refresh]);
  const handleResolve = useCallback((commentId: string) => { collaborationManager.resolveComment(commentId); refresh(); }, [refresh]);
  const handleReaction = useCallback((commentId: string, emoji: string) => { collaborationManager.addReaction(commentId, emoji); refresh(); }, [refresh]);
  const toggleThread = useCallback((id: string) => { setExpandedThreads((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);
  const handleCreateApproval = useCallback(() => { if (!approvalTitle.trim()) return; collaborationManager.createApproval(dashboardId, 'publish', approvalTitle.trim(), approvalDesc.trim() || undefined); setApprovalTitle(''); setApprovalDesc(''); setShowApprovalForm(false); refresh(); }, [dashboardId, approvalTitle, approvalDesc, refresh]);
  const handleReview = useCallback((requestId: string, status: Exclude<ApprovalStatus, 'pending' | 'cancelled'>) => { collaborationManager.reviewApproval(requestId, status); refresh(); }, [refresh]);
  const handleMarkRead = useCallback((id: string) => { collaborationManager.markRead(id); refresh(); }, [refresh]);
  const handleMarkAllRead = useCallback(() => { collaborationManager.markAllRead(); refresh(); }, [refresh]);

  const renderComment = (comment: Comment, isReply = false): React.ReactNode => {
    const replies = collaborationManager.getReplies(comment.id);
    const isExpanded = expandedThreads.has(comment.id);
    return (
      <div key={comment.id} className={`collab-comment ${isReply ? 'reply' : ''} ${comment.status === 'resolved' ? 'resolved' : ''}`}>
        <div className="collab-comment-header">
          <div className="collab-avatar" style={{ background: comment.author.color }}>{comment.author.name.charAt(0)}</div>
          <div className="collab-comment-meta">
            <span className="collab-comment-author">{comment.author.name}</span>
            <span className="collab-comment-time">{timeAgo(comment.createdAt)}</span>
          </div>
          {comment.status === 'resolved' && <span className="collab-badge collab-badge-green">Resolved</span>}
        </div>
        <div className="collab-comment-body">{renderCommentContent(comment.content, comment.mentions)}</div>
        {comment.reactions.length > 0 && (
          <div className="collab-reactions">
            {Object.entries(comment.reactions.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {})).map(([emoji, count]) => (
              <button key={emoji} className="collab-reaction" onClick={() => handleReaction(comment.id, emoji)}>{emoji} {count}</button>
            ))}
          </div>
        )}
        <div className="collab-comment-actions">
          {!isReply && <button className="collab-action-btn" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>Reply</button>}
          {comment.status === 'open' && <button className="collab-action-btn" onClick={() => handleResolve(comment.id)}>Resolve</button>}
          <button className="collab-action-btn" onClick={() => handleReaction(comment.id, 'thumbsup')}>+1</button>
          <button className="collab-action-btn" onClick={() => handleReaction(comment.id, 'heart')}>Heart</button>
        </div>
        {replyTo === comment.id && (
          <div className="collab-reply-form">
            <input className="collab-input" value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder={`Reply to ${comment.author.name}...`} onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)} autoFocus />
            <button className="collab-btn-sm collab-btn-primary" onClick={() => handleReply(comment.id)}>Reply</button>
          </div>
        )}
        {!isReply && replies.length > 0 && (
          <>
            <button className="collab-thread-toggle" onClick={() => toggleThread(comment.id)}>{isExpanded ? '- ' : '+ '}{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</button>
            {isExpanded && <div className="collab-replies">{replies.map((r) => renderComment(r, true))}</div>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="collab-root">
      {/* Presence bar */}
      <div className="collab-presence-bar">
        <div className="collab-presence-avatars">
          <div className="collab-presence-avatar you" style={{ background: user.color }} title={`${user.name} (you)`}>{user.name.charAt(0)}</div>
          {presence.filter((p) => p.userId !== user.id).map((p) => {
            const u = collaborationManager.getUser(p.userId);
            if (!u) return null;
            return (<div key={p.userId} className={`collab-presence-avatar ${p.status}`} style={{ background: u.color }} title={`${u.name} - ${p.status}`}>{u.name.charAt(0)}<span className={`collab-presence-dot ${p.status}`} /></div>);
          })}
        </div>
        <span className="collab-presence-count">{presence.filter((p) => p.status === 'online').length} online</span>
        {conflicts.length > 0 && <span className="collab-conflict-badge" title={`${conflicts.length} conflict(s)`}>! {conflicts.length}</span>}
      </div>

      {/* Tabs */}
      <div className="collab-tabs">
        <button className={`collab-tab ${activeTab === 'comments' ? 'active' : ''}`} onClick={() => setActiveTab('comments')}>Comments</button>
        <button className={`collab-tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => { setActiveTab('activity'); refresh(); }}>Activity</button>
        <button className={`collab-tab ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>Alerts{unreadCount > 0 && <span className="collab-tab-badge">{unreadCount}</span>}</button>
        <button className={`collab-tab ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>Approvals</button>
        <button className={`collab-tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>Audit</button>
      </div>

      {/* Comments */}
      {activeTab === 'comments' && (
        <div className="collab-tab-content">
          <div className="collab-comment-input">
            <div className="collab-avatar" style={{ background: user.color }}>{user.name.charAt(0)}</div>
            <div className="collab-input-wrap">
              <input className="collab-input" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment... (@ to mention)" onKeyDown={(e) => e.key === 'Enter' && handlePostComment()} />
              <button className="collab-btn-sm collab-btn-primary" onClick={handlePostComment} disabled={!newComment.trim()}>Post</button>
            </div>
          </div>
          <div className="collab-comment-filters">
            {(['all', 'open', 'resolved'] as const).map((s) => (<button key={s} className={`collab-filter-btn ${commentFilter === s ? 'active' : ''}`} onClick={() => setCommentFilter(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>))}
          </div>
          <div className="collab-comments-list">
            {threads.length === 0 ? <div className="collab-empty"><p>No comments yet</p></div> : threads.map((c) => renderComment(c))}
          </div>
        </div>
      )}

      {/* Activity */}
      {activeTab === 'activity' && (
        <div className="collab-tab-content">
          <div className="collab-activity-list">
            {activities.length === 0 ? <div className="collab-empty"><p>No activity yet</p></div> : activities.map((a) => (
              <div key={a.id} className="collab-activity-item">
                <div className="collab-activity-icon">{ACTION_ICONS[a.action] ?? '.'}</div>
                <div className="collab-activity-info">
                  <span className="collab-activity-text"><strong>{a.user.name}</strong> {a.action} the {a.targetType}{a.targetName ? ` "${a.targetName}"` : ''}</span>
                  <span className="collab-activity-time">{timeAgo(a.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <div className="collab-tab-content">
          {unreadCount > 0 && <button className="collab-btn-sm collab-btn-full" onClick={handleMarkAllRead}>Mark all as read</button>}
          <div className="collab-notif-list">
            {notifications.length === 0 ? <div className="collab-empty"><p>No notifications</p></div> : notifications.map((n) => (
              <div key={n.id} className={`collab-notif-item ${n.read ? '' : 'unread'}`} onClick={() => handleMarkRead(n.id)}>
                <div className="collab-notif-icon" style={{ color: PRIORITY_DOTS[n.priority] }}>{NOTIF_ICONS[n.type] ?? '.'}</div>
                <div className="collab-notif-info">
                  <span className="collab-notif-title">{n.title}</span>
                  <span className="collab-notif-msg">{n.message}</span>
                  <span className="collab-notif-time">{timeAgo(n.createdAt)}</span>
                </div>
                {!n.read && <span className="collab-notif-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approvals */}
      {activeTab === 'approvals' && (
        <div className="collab-tab-content">
          <button className="collab-btn-sm collab-btn-full collab-btn-primary" onClick={() => setShowApprovalForm(!showApprovalForm)}>{showApprovalForm ? 'Cancel' : '+ Request Approval'}</button>
          {showApprovalForm && (
            <div className="collab-approval-form">
              <input className="collab-input" value={approvalTitle} onChange={(e) => setApprovalTitle(e.target.value)} placeholder="Title (e.g. Publish v2.0)" />
              <textarea className="collab-textarea" value={approvalDesc} onChange={(e) => setApprovalDesc(e.target.value)} placeholder="Description (optional)" rows={2} />
              <button className="collab-btn-sm collab-btn-primary" onClick={handleCreateApproval} disabled={!approvalTitle.trim()}>Submit</button>
            </div>
          )}
          <div className="collab-approval-list">
            {approvals.length === 0 ? <div className="collab-empty"><p>No approval requests</p></div> : approvals.map((a) => (
              <div key={a.id} className="collab-approval-card">
                <div className="collab-approval-header">
                  <span className="collab-approval-title">{a.title}</span>
                  <span className="collab-badge" style={{ background: (STATUS_COLORS[a.status] ?? '#6b7280') + '18', color: STATUS_COLORS[a.status] ?? '#6b7280' }}>{a.status.replace('_', ' ')}</span>
                </div>
                {a.description && <p className="collab-approval-desc">{a.description}</p>}
                <div className="collab-approval-requester">
                  <div className="collab-avatar-sm" style={{ background: a.requester.color }}>{a.requester.name.charAt(0)}</div>
                  <span>{a.requester.name}</span>
                  <span className="collab-approval-time">{timeAgo(a.createdAt)}</span>
                </div>
                <div className="collab-reviewers">
                  {a.reviewers.map((r) => (
                    <div key={r.userId} className="collab-reviewer">
                      <span className="collab-reviewer-name">{r.name}</span>
                      <span className="collab-badge" style={{ background: (STATUS_COLORS[r.status] ?? '#6b7280') + '18', color: STATUS_COLORS[r.status] ?? '#6b7280' }}>{r.status}</span>
                      {r.comment && <span className="collab-reviewer-comment">{r.comment}</span>}
                      {r.status === 'pending' && a.requester.id !== user.id && (
                        <div className="collab-reviewer-actions">
                          <button className="collab-btn-xs collab-btn-approve" onClick={() => handleReview(a.id, 'approved')}>Approve</button>
                          <button className="collab-btn-xs collab-btn-reject" onClick={() => handleReview(a.id, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit */}
      {activeTab === 'audit' && (
        <div className="collab-tab-content">
          <div className="collab-audit-list">
            {auditLog.length === 0 ? <div className="collab-empty"><p>No audit entries</p></div> : auditLog.map((entry) => (
              <div key={entry.id} className={`collab-audit-item severity-${entry.severity}`}>
                <div className="collab-audit-dot" style={{ background: STATUS_COLORS[entry.severity] ?? '#6b7280' }} />
                <div className="collab-audit-info">
                  <span className="collab-audit-action">{entry.action}</span>
                  <span className="collab-audit-user">{entry.user.name}</span>
                  <span className="collab-audit-time">{timeAgo(entry.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
