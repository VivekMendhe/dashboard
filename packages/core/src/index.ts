import type React from 'react';
export type WidgetType = string;
export type Primitive = string | number | boolean | null;
export type DataRecord = Record<string, unknown>;
export type DashboardRole = 'viewer' | 'editor' | 'admin';
export type ShareVisibility = 'private' | 'workspace' | 'link';
export type ExportFormat = 'pdf' | 'png' | 'excel' | 'csv';

export interface ShareCollaborator {
  id: string;
  name: string;
  email?: string;
  role: DashboardRole;
  addedAt: string;
  addedBy?: string;
}
export interface ShareLink {
  id: string;
  token: string;
  url: string;
  visibility: ShareVisibility;
  password?: string;
  expiresAt?: string;
  createdAt: string;
  accessCount: number;
  lastAccessedAt?: string;
}
export interface EmbedSettings {
  enabled: boolean;
  allowedDomains?: string[];
  showHeader?: boolean;
  showFilters?: boolean;
  height?: number;
  width?: number;
  theme?: 'light' | 'dark' | 'auto';
}
export interface DashboardShare {
  visibility: ShareVisibility;
  allowExport?: boolean;
  allowPrint?: boolean;
  allowDownload?: boolean;
  expiresAt?: string;
  password?: string;
  collaborators?: ShareCollaborator[];
  links?: ShareLink[];
  embed?: EmbedSettings;
  watermark?: string;
  maxViewers?: number;
}

export interface GridPosition { x: number; y: number; w: number; h: number; minW?: number; minH?: number; maxW?: number; maxH?: number }
export interface StaticDataSource { kind: 'static'; data: DataRecord[] }
/** `url` is retained for legacy, public endpoints. New dashboards should use `connectionId`. */
export interface RestDataSource { kind: 'rest'; url?: string; connectionId?: string; path?: string; method?: 'GET' | 'POST'; params?: Record<string, Primitive>; body?: Record<string, unknown> }
export interface GraphqlDataSource { kind: 'graphql'; connectionId: string; query: string; variables?: Record<string, unknown>; path?: string }
export interface MysqlDataSource { kind: 'mysql'; connectionId: string; query: string; params?: Primitive[] }
export interface PostgresDataSource { kind: 'postgres'; connectionId: string; query: string; params?: Primitive[] }
export interface SqlServerDataSource { kind: 'sqlserver'; connectionId: string; query: string; params?: Primitive[] }
export interface OracleDataSource { kind: 'oracle'; connectionId: string; query: string; params?: Primitive[] }
export interface MongoDbDataSource { kind: 'mongodb'; connectionId: string; collection: string; filter?: Record<string, unknown>; projection?: Record<string, unknown>; sort?: Record<string, 1 | -1>; limit?: number }
export interface SnowflakeDataSource { kind: 'snowflake'; connectionId: string; query: string; params?: Primitive[] }
export interface BigQueryDataSource { kind: 'bigquery'; connectionId: string; query: string; params?: Primitive[] }
export interface CsvDataSource { kind: 'csv'; connectionId?: string; fileUrl?: string; delimiter?: string; hasHeader?: boolean }
export interface ExcelDataSource { kind: 'excel'; connectionId?: string; fileUrl?: string; sheet?: string }
export interface JsonFileDataSource { kind: 'jsonfile'; connectionId?: string; fileUrl?: string; path?: string }
export type DataSourceConfig = StaticDataSource | RestDataSource | GraphqlDataSource | MysqlDataSource | PostgresDataSource | SqlServerDataSource | OracleDataSource | MongoDbDataSource | SnowflakeDataSource | BigQueryDataSource | CsvDataSource | ExcelDataSource | JsonFileDataSource;

export type ConnectionType = 'rest' | 'graphql' | 'mysql' | 'postgres' | 'sqlserver' | 'oracle' | 'mongodb' | 'snowflake' | 'bigquery' | 'csv' | 'excel' | 'jsonfile';
export interface ConnectionConfig {
  id: string; name: string; type: ConnectionType; description?: string;
  /** REST / GraphQL */
  baseUrl?: string; endpoint?: string; headers?: Record<string, string>; authType?: 'none' | 'bearer' | 'basic' | 'api-key'; authToken?: string; apiKeyHeader?: string;
  /** Database connections */
  host?: string; port?: number; database?: string; schema?: string; username?: string; password?: string;
  /** MongoDB */
  authDb?: string;
  /** Snowflake */
  account?: string; warehouse?: string; role?: string;
  /** BigQuery */
  projectId?: string; dataset?: string; keyFile?: string;
  /** CSV / Excel / JSON */
  fileUrl?: string; delimiter?: string; hasHeader?: boolean; sheet?: string;
  /** Settings */
  timeout?: number; retries?: number; cacheTTL?: number;
  /** Status */
  lastTested?: string; lastTestResult?: 'success' | 'error'; lastTestError?: string;
  createdAt: string; updatedAt: string;
}
export interface SchemaColumn { name: string; type: string; nullable?: boolean; primaryKey?: boolean; description?: string }
export interface SchemaTable { name: string; schema?: string; columns: SchemaColumn[]; rowCount?: number; description?: string }
export interface SchemaInfo { connectionId: string; tables: SchemaTable[]; views?: SchemaTable[]; fetchedAt: string }
export interface ConnectionTestResult { success: boolean; message: string; latencyMs?: number; schema?: SchemaInfo }
export interface DataField { name: string; label?: string; type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown'; nullable?: boolean }
export interface DatasetConfig { id: string; name: string; datasource: DataSourceConfig; fields?: DataField[]; description?: string }
export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL' | 'BETWEEN';
export interface WhereClause { field: string; operator: FilterOperator; value?: Primitive | Primitive[] }
export interface JoinClause { datasetId: string; type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'; onLeft: string; onRight: string; alias?: string }
export interface CalculatedField { name: string; expression: string; type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime' }
export interface WidgetBinding { datasetId?: string; dimensions?: string[]; metrics?: { field: string; aggregation?: 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count' }[]; filters?: Record<string, Primitive>; limit?: number; sort?: { field: string; direction: 'asc' | 'desc' }[]; joins?: JoinClause[]; calculatedFields?: CalculatedField[]; groupBy?: string[]; where?: WhereClause[]; having?: WhereClause[]; sql?: string; orderBy?: { field: string; direction: 'asc' | 'desc' }[] }
export interface ResponsivePositionMap { desktop?: GridPosition; laptop?: GridPosition; tablet?: GridPosition; mobile?: GridPosition }
export interface DashboardWidget { id: string; type: WidgetType; title?: string; position: GridPosition; /** Optional breakpoint-specific positions; `position` remains the desktop fallback. */ positions?: ResponsivePositionMap; datasource?: DataSourceConfig; binding?: WidgetBinding; options?: Record<string, unknown>; style?: Record<string, string | number> }
export interface FilterConfig { id: string; label: string; type: 'search' | 'select' | 'checkbox' | 'radio' | 'date'; field?: string; options?: { label: string; value: Primitive }[]; defaultValue?: Primitive }
export interface DashboardConfig { id: string; title: string; description?: string; version: string; theme?: 'light' | 'dark' | ThemeTokens; filters?: FilterConfig[]; datasets?: DatasetConfig[]; variables?: DashboardVariable[]; calculatedFields?: DashboardCalculatedField[]; sharing?: DashboardShareConfig; schedule?: DashboardSchedule; widgets: DashboardWidget[] }
export interface DashboardIdentity { workspaceId: string; dashboardId: string; ownerId: string }
export interface DashboardRevision { revision: number; updatedAt: string; updatedBy: string; message?: string }
export interface PersistedDashboard { identity: DashboardIdentity; config: DashboardConfig; revision: DashboardRevision; deletedAt?: string }
export interface DashboardShareConfig { visibility: 'private' | 'workspace' | 'link'; allowExport?: boolean; expiresAt?: string }
export interface DashboardSchedule { enabled: boolean; cadence: 'daily' | 'weekly' | 'monthly'; recipients: string[]; timezone?: string; format: 'pdf' | 'png' }
export interface DashboardTemplate { id: string; name: string; description: string; category: string; previewColor: string; config: DashboardConfig }
export interface ThemeTokens { primary: string; secondary: string; success: string; warning: string; error: string; background: string; surface: string; text: string; mutedText: string; border: string; radius: string; font: string }

/* ---- Interaction types ---- */
export type InteractionTrigger = 'click' | 'hover';
export type InteractionAction = 'crossFilter' | 'drillDown' | 'drillThrough' | 'setVariable' | 'openUrl' | 'showFilter' | 'none';
export interface WidgetInteraction {
  enabled?: boolean;
  trigger?: InteractionTrigger;
  action?: InteractionAction;
  /** crossFilter: field name in the clicked row to use as filter key */
  crossFilterField?: string;
  /** crossFilter: which widgets to filter (empty = all with same dataset) */
  crossFilterTargets?: string[];
  /** drillDown: hierarchy of fields to drill into */
  drillDownHierarchy?: string[];
  /** drillDown: current depth (managed at runtime) */
  drillDownDepth?: number;
  /** drillThrough: target dashboard ID */
  drillThroughDashboard?: string;
  /** drillThrough: query params to pass */
  drillThroughParams?: Record<string, string>;
  /** setVariable: variable name and value source */
  variableName?: string;
  variableValueField?: string;
  /** openUrl: URL template with {{field}} interpolation */
  urlTemplate?: string;
  urlTarget?: '_blank' | '_self';
}
export interface CrossFilterState {
  sourceWidgetId: string;
  field: string;
  value: Primitive;
  timestamp: number;
}
export interface DrillDownState {
  widgetId: string;
  hierarchy: string[];
  depth: number;
  breadcrumbs: { field: string; value: Primitive }[];
}

/* ---- Dashboard variables ---- */
export type VariableType = 'string' | 'number' | 'boolean' | 'date' | 'select';
export interface DashboardVariable {
  name: string;
  label: string;
  type: VariableType;
  defaultValue?: Primitive;
  options?: { label: string; value: Primitive }[];
  /** Sync to URL query parameter */
  urlParam?: string;
  description?: string;
}

/* ---- Conditional formatting ---- */
export type ConditionOperator = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'contains' | 'notContains' | 'between' | 'isNull' | 'isNotNull';
export interface ConditionalFormatRule {
  id: string;
  field: string;
  operator: ConditionOperator;
  value?: Primitive | [Primitive, Primitive];
  style: { background?: string; color?: string; fontWeight?: string; icon?: string };
}
export interface DynamicColorRule {
  id: string;
  field: string;
  thresholds: { value: Primitive; color: string; operator?: ConditionOperator }[];
  defaultColor?: string;
}
export interface DynamicLabelRule {
  id: string;
  field: string;
  mappings: { match: Primitive; label: string }[];
  defaultLabel?: string;
}

/* ---- Bookmarks & Saved Views ---- */
export interface Bookmark {
  id: string;
  name: string;
  timestamp: string;
  dashboardId: string;
  state: DashboardStateSnapshot;
}
export interface SavedView {
  id: string;
  name: string;
  description?: string;
  timestamp: string;
  dashboardId: string;
  state: DashboardStateSnapshot;
  thumbnail?: string;
}
export interface DashboardStateSnapshot {
  filterValues: Record<string, Primitive>;
  variableValues: Record<string, Primitive>;
  widgetPositions?: Record<string, GridPosition>;
  drillDownStates?: Record<string, DrillDownState>;
}

/* ---- Calculated fields (dashboard-level) ---- */
export interface DashboardCalculatedField {
  name: string;
  expression: string;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
  description?: string;
}

/* ---- Dashboard management ---- */
export type DashboardStatus = 'draft' | 'published' | 'archived';
export interface DashboardFolder {
  id: string;
  name: string;
  parentId?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}
export interface DashboardMeta {
  id: string;
  title: string;
  description?: string;
  status: DashboardStatus;
  folderId?: string;
  tags: string[];
  favorite: boolean;
  thumbnail?: string;
  widgetCount: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  version: number;
  author?: string;
}
export interface DashboardVersion {
  revision: number;
  config: DashboardConfig;
  message?: string;
  createdAt: string;
  createdBy: string;
}
export interface AutosaveConfig {
  enabled: boolean;
  intervalMs: number;
  lastSavedAt?: string;
}
export type DashboardSortField = 'title' | 'updatedAt' | 'createdAt' | 'lastAccessedAt' | 'widgetCount';
export type DashboardSortDir = 'asc' | 'desc';
export interface DashboardListFilter {
  search?: string;
  status?: DashboardStatus | 'all';
  folderId?: string;
  tags?: string[];
  favorite?: boolean;
  sort?: DashboardSortField;
  sortDir?: DashboardSortDir;
}

/* ---- Collaboration: Users & Presence ---- */
export type CollaboratorStatus = 'online' | 'idle' | 'offline';
export interface CollabUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
}
export interface PresenceState {
  userId: string;
  dashboardId: string;
  status: CollaboratorStatus;
  cursor?: { x: number; y: number };
  selectedWidgetIds?: string[];
  activePanel?: string;
  lastSeen: string;
}

/* ---- Collaboration: Comments & Mentions ---- */
export type CommentStatus = 'open' | 'resolved' | 'archived';
export type CommentTarget = 'dashboard' | 'widget' | 'selection';
export interface CommentMention {
  userId: string;
  name: string;
  offset: number;
  length: number;
}
export interface CommentReaction {
  emoji: string;
  userId: string;
  createdAt: string;
}
export interface Comment {
  id: string;
  dashboardId: string;
  author: CollabUser;
  target: CommentTarget;
  targetId?: string;
  content: string;
  mentions: CommentMention[];
  reactions: CommentReaction[];
  status: CommentStatus;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

/* ---- Collaboration: Activity Timeline ---- */
export type ActivityAction = 'create' | 'update' | 'delete' | 'move' | 'resize' | 'style' | 'comment' | 'publish' | 'archive' | 'restore' | 'share' | 'approve' | 'rollback' | 'import' | 'export';
export interface ActivityEntry {
  id: string;
  dashboardId: string;
  user: CollabUser;
  action: ActivityAction;
  targetType: 'dashboard' | 'widget' | 'comment' | 'version' | 'share' | 'settings';
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/* ---- Collaboration: Audit Log ---- */
export type AuditSeverity = 'info' | 'warning' | 'critical';
export interface AuditEntry {
  id: string;
  dashboardId: string;
  user: CollabUser;
  action: string;
  severity: AuditSeverity;
  details: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

/* ---- Collaboration: Notifications ---- */
export type NotificationType = 'mention' | 'comment' | 'reply' | 'approval_request' | 'approval_decision' | 'share_invite' | 'publish' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  dashboardId?: string;
  dashboardName?: string;
  fromUser?: CollabUser;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
  expiresAt?: string;
}

/* ---- Collaboration: Approval Workflow ---- */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'changes_requested';
export type ApprovalScope = 'publish' | 'major_change' | 'data_source' | 'sharing' | 'custom';
export interface ApprovalRequest {
  id: string;
  dashboardId: string;
  requester: CollabUser;
  scope: ApprovalScope;
  title: string;
  description?: string;
  status: ApprovalStatus;
  reviewers: ApprovalReviewer[];
  snapshot?: DashboardConfig;
  decision?: { status: Exclude<ApprovalStatus, 'pending'>; comment?: string; decidedBy: CollabUser; decidedAt: string };
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
export interface ApprovalReviewer {
  userId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  comment?: string;
  reviewedAt?: string;
}

/* ---- Collaboration: Conflict Detection ---- */
export type ConflictType = 'concurrent_edit' | 'concurrent_delete' | 'outdated_config' | 'schema_mismatch';
export type ConflictResolution = 'local' | 'remote' | 'merge' | 'manual';
export interface ConflictInfo {
  id: string;
  dashboardId: string;
  type: ConflictType;
  localVersion: number;
  remoteVersion: number;
  localUser: CollabUser;
  remoteUser: CollabUser;
  affectedFields: string[];
  detectedAt: string;
  resolved?: { resolution: ConflictResolution; resolvedBy: CollabUser; resolvedAt: string };
}
export interface CollaborationLock {
  dashboardId: string;
  userId: string;
  userName: string;
  lockedAt: string;
  expiresAt: string;
  resource?: string;
}

/* ---- Collaboration: Live Architecture ---- */
export type CollabEventType = 'presence_update' | 'cursor_move' | 'widget_select' | 'widget_lock' | 'widget_unlock' | 'comment_add' | 'comment_update' | 'comment_resolve' | 'notification' | 'conflict_detected' | 'approval_update' | 'config_change' | 'lock_acquired' | 'lock_released';
export interface CollabEvent {
  type: CollabEventType;
  userId: string;
  dashboardId: string;
  timestamp: string;
  payload: unknown;
}
export interface CollabChannel {
  dashboardId: string;
  subscribe(callback: (event: CollabEvent) => void): () => void;
  emit(event: Omit<CollabEvent, 'timestamp'>): void;
}

/* ================================================================== */
/*  Enterprise Security Types                                          */
/* ================================================================== */

export type SecurityRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'guest';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';
export type AuthMethod = 'password' | 'sso' | 'saml' | 'oauth' | 'api_key';
export type ResourceType = 'organization' | 'workspace' | 'dashboard' | 'datasource' | 'team' | 'user' | 'settings' | 'api_key' | 'audit';
export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'share' | 'export' | 'manage' | 'approve';
export type ApiKeyStatus = 'active' | 'expired' | 'revoked';
export type SecretAccessLevel = 'read' | 'write' | 'admin';
export type EncryptionAlgorithm = 'AES-256-GCM' | 'AES-128-GCM' | 'RSA-2048';
export type EncryptionKeyStatus = 'active' | 'rotating' | 'retired';
export type SSOProvider = 'okta' | 'azure_ad' | 'google_workspace' | 'auth0' | 'onelogin' | 'custom_saml' | 'custom_oidc';
export type OAuthProvider = 'github' | 'gitlab' | 'google' | 'microsoft' | 'custom';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  settings: OrgSettings;
  createdAt: string;
  updatedAt: string;
}
export interface OrgSettings {
  defaultRole: SecurityRole;
  ssoEnabled: boolean;
  ssoProvider?: SSOProvider;
  ipWhitelist: string[];
  requireMFA: boolean;
  sessionTimeout: number;
  maxUsers: number;
  allowedDomains: string[];
}
export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  settings: WorkspaceSettings;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceSettings {
  defaultRole: SecurityRole;
  allowPublicDashboards: boolean;
  dataRetentionDays: number;
  allowedConnectionTypes: string[];
}
export interface SecurityUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  status: UserStatus;
  orgId: string;
  workspaceIds: string[];
  teamIds: string[];
  role: SecurityRole;
  lastLoginAt?: string;
  createdAt: string;
  mfaEnabled: boolean;
  authMethod: AuthMethod;
}
export interface Team {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  color?: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: ResourceType;
  action: PermissionAction;
}
export interface RolePermissions {
  role: SecurityRole;
  permissions: Permission[];
  inheritsFrom?: SecurityRole;
}
export interface RBACPolicy {
  id: string;
  name: string;
  description?: string;
  effect: 'allow' | 'deny';
  permissions: Permission[];
  conditions: PolicyCondition[];
  priority: number;
  enabled: boolean;
  createdAt: string;
}
export interface PolicyCondition {
  type: 'resource_owner' | 'team_member' | 'time_range' | 'ip_range' | 'attribute';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'between';
  field?: string;
  value: unknown;
}
export interface SSOConfig {
  provider: SSOProvider;
  enabled: boolean;
  entityId: string;
  ssoUrl: string;
  certificate: string;
  metadataUrl?: string;
  attributeMapping: SSOAttributeMapping;
  createdAt: string;
}
export interface SSOAttributeMapping {
  email: string;
  name: string;
  groups?: string;
  role?: string;
}
export interface SAMLConfig {
  enabled: boolean;
  issuer: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  signRequests: boolean;
  attributeMapping: SSOAttributeMapping;
  createdAt: string;
}
export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecretRef: string;
  scopes: string[];
  redirectUri: string;
  enabled: boolean;
  createdAt: string;
}
export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdBy: string;
  status: ApiKeyStatus;
  createdAt: string;
}
export interface SecurityAuditEntry {
  id: string;
  orgId: string;
  workspaceId?: string;
  userId: string;
  userName: string;
  action: string;
  resource: ResourceType;
  resourceId: string;
  details: Record<string, unknown>;
  severity: 'info' | 'warning' | 'critical' | 'security';
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}
export interface Secret {
  id: string;
  name: string;
  description?: string;
  encryptedValue: string;
  keyId: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  rotatedAt?: string;
  expiresAt?: string;
  tags: string[];
}
export interface EncryptionKey {
  id: string;
  name: string;
  algorithm: EncryptionAlgorithm;
  status: EncryptionKeyStatus;
  createdAt: string;
  rotatedAt?: string;
  expiresAt?: string;
}
export interface SecretAccess {
  secretId: string;
  userId: string;
  userName: string;
  grantedAt: string;
  expiresAt?: string;
  accessLevel: SecretAccessLevel;
}
export interface SecurityConfig {
  organizations: Organization[];
  workspaces: Workspace[];
  users: SecurityUser[];
  teams: Team[];
  roles: RolePermissions[];
  policies: RBACPolicy[];
  sso?: SSOConfig;
  saml?: SAMLConfig;
  oauth?: OAuthConfig;
  apiKeys: ApiKey[];
  auditLog: SecurityAuditEntry[];
  secrets: Secret[];
  encryptionKeys: EncryptionKey[];
  secretAccess: SecretAccess[];
}

/* ================================================================== */
/*  White-Label & Branding Types                                       */
/* ================================================================== */

export type LicenseType = 'community' | 'professional' | 'enterprise' | 'ultimate';
export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'trial';
export type LicenseFeature = 'white_label' | 'sso' | 'audit_log' | 'api_access' | 'priority_support' | 'custom_domain' | 'advanced_security' | 'collaboration' | 'export' | 'embedding' | 'custom_themes' | 'workspace_branding';

export interface CompanyBranding {
  name: string;
  tagline?: string;
  supportEmail?: string;
  legalUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}
export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}
export interface BrandTypography {
  fontFamily: string;
  fontUrl?: string;
  headingFont?: string;
  monospaceFont?: string;
  baseFontSize: number;
  lineHeight: number;
}
export interface LogoConfig {
  url?: string;
  alt: string;
  width: number;
  height: number;
  favicon?: string;
  mark?: string;
  showInToolbar: boolean;
  showOnLogin: boolean;
  showOnExport: boolean;
}
export interface DomainConfig {
  customDomain?: string;
  subdomain?: string;
  sslEnabled: boolean;
  redirectFrom?: string;
}
export interface WhiteLabelConfig {
  enabled: boolean;
  company: CompanyBranding;
  colors: BrandColors;
  typography: BrandTypography;
  logo: LogoConfig;
  domain: DomainConfig;
  customCss: string;
  loginBackground?: string;
  emailTemplate?: string;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceBranding {
  workspaceId: string;
  branding: Partial<WhiteLabelConfig>;
  inheritOrgBranding: boolean;
  updatedAt: string;
}
export interface LicenseConfig {
  id: string;
  key: string;
  type: LicenseType;
  status: LicenseStatus;
  orgId: string;
  features: LicenseFeature[];
  maxUsers: number;
  maxDashboards: number;
  maxWorkspaces: number;
  maxApiKeys: number;
  expiresAt?: string;
  trialEndsAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface BrandingConfig {
  whiteLabel: WhiteLabelConfig;
  workspaceBranding: WorkspaceBranding[];
  license: LicenseConfig;
  presets: BrandPreset[];
}
export interface BrandPreset {
  id: string;
  name: string;
  description?: string;
  colors: BrandColors;
  typography: BrandTypography;
  createdAt: string;
}

/* ================================================================== */
/*  Plugin SDK Types                                                    */
/* ================================================================== */

export type PluginStatus = 'installed' | 'active' | 'inactive' | 'error' | 'loading';
export type PluginPermission = 'widgets' | 'datasources' | 'themes' | 'editors' | 'inspector' | 'store' | 'events' | 'ui' | 'network';
export type PluginCategory = 'widget' | 'datasource' | 'theme' | 'integration' | 'analytics' | 'utility' | 'visualization' | 'productivity';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl?: string;
  icon?: string;
  homepage?: string;
  license?: string;
  minPlatformVersion: string;
  maxPlatformVersion?: string;
  permissions: PluginPermission[];
  dependencies: PluginDependency[];
  tags: string[];
  categories: PluginCategory[];
  screenshots?: string[];
  changelog?: string;
  createdAt: string;
}
export interface PluginDependency {
  id: string;
  version: string;
  optional?: boolean;
}
export interface PluginRegistration {
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: string;
  activatedAt?: string;
  error?: string;
  loadOrder: number;
}
export interface PluginStorage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  keys(): string[];
}
export interface PluginLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}
export interface PropertyEditorDefinition {
  type: string;
  name: string;
  icon?: string;
  renderer: React.ComponentType<PropertyEditorProps>;
}
export interface PropertyEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  schema: PropertySchema;
  widget: DashboardWidget;
  theme: ThemeTokens;
}
export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'color' | 'select' | 'multiselect' | 'json' | 'expression' | 'range';
  label: string;
  description?: string;
  default?: unknown;
  options?: { label: string; value: unknown }[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  group?: string;
}
export interface InspectorTabDefinition {
  id: string;
  label: string;
  icon?: string;
  position: number;
  permissions?: PluginPermission[];
}
export interface PluginAPI {
  registerWidget(def: WidgetDefinition): () => void;
  registerWidgets(defs: WidgetDefinition[]): () => void;
  registerDatasource(kind: string, datasource: Datasource): () => void;
  registerTheme(id: string, tokens: ThemeTokens): () => void;
  registerPropertyEditor(definition: PropertyEditorDefinition): () => void;
  registerInspectorTab(tab: InspectorTabDefinition): () => void;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
  emit(event: string, ...data: unknown[]): void;
  getStorage(): PluginStorage;
  getLogger(): PluginLogger;
  getManifest(): PluginManifest;
  hasPermission(permission: PluginPermission): boolean;
}
export interface Plugin {
  manifest: PluginManifest;
  activate(api: PluginAPI): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}
export interface PluginStoreItem {
  manifest: PluginManifest;
  rating: number;
  installs: number;
  featured: boolean;
}

/* ================================================================== */
/*  Widget Registry & Validation                                       */
/* ================================================================== */

export interface LoadedData { data: DataRecord[]; refresh(): Promise<DataRecord[]> }
export interface Datasource { load(config: DataSourceConfig): Promise<LoadedData> }
export interface WidgetRenderProps { widget: DashboardWidget; data: DataRecord[]; loading: boolean; error?: Error; filters: Record<string, Primitive>; theme: ThemeTokens }
export type WidgetRenderer = (props: WidgetRenderProps) => React.ReactNode;
export interface WidgetDefinition { type: string; name: string; renderer: WidgetRenderer; defaultOptions?: Record<string, unknown> }

class Registry<T extends { type: string }> { private items = new Map<string, T>(); register(item: T) { this.items.set(item.type, item); return () => this.items.delete(item.type) } get(type: string) { return this.items.get(type) } unregister(type: string) { this.items.delete(type) } list() { return [...this.items.values()] } }
const widgetRegistry = new Registry<WidgetDefinition>();
export const registerWidget = (definition: WidgetDefinition) => widgetRegistry.register(definition);
export const getWidget = (type: string) => widgetRegistry.get(type);
export const unregisterWidget = (type: string) => widgetRegistry.unregister(type);
export const listWidgets = () => widgetRegistry.list();

const datasources = new Map<string, Datasource>();
export const registerDatasource = (kind: string, datasource: Datasource) => { datasources.set(kind, datasource); return () => datasources.delete(kind) };
export const getDatasource = (kind: string) => datasources.get(kind);
export const validateDashboard = (value: DashboardConfig): DashboardConfig => {
  if (!value?.id || !value.title || !value.version || !Array.isArray(value.widgets)) throw new Error('Invalid dashboard config: id, title, version and widgets are required.');
  const ids = new Set<string>();
  const datasetIds = new Set((value.datasets ?? []).map((dataset) => dataset.id));
  if (datasetIds.size !== (value.datasets ?? []).length) throw new Error('Duplicate dataset id.');
  value.widgets.forEach((widget) => {
    if (!widget.id || !widget.type || !widget.position || ids.has(widget.id)) throw new Error(`Invalid or duplicate widget: ${widget.id}`);
    const positions = [widget.position, ...Object.values(widget.positions ?? {})];
    positions.forEach((position) => { if (!Number.isInteger(position.x) || !Number.isInteger(position.y) || position.x < 0 || position.y < 0 || position.w < 1 || position.h < 1 || position.x + position.w > 12) throw new Error(`Invalid position for widget: ${widget.id}`); });
    if (widget.binding?.datasetId && !datasetIds.has(widget.binding.datasetId)) throw new Error(`Unknown dataset binding for widget: ${widget.id}`);
    ids.add(widget.id);
  });
  return value;
};
