export type UserRole = "MANAGER" | "FIELD";
export type FileScope = "MAIN" | "TIMELINE";
export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type NotificationCampaignType = "MANUAL" | "DAILY_REMINDER";
export type NotificationDeliveryStatus = "PENDING" | "SENT" | "FAILED";

export type ProjectEntryType =
  | "MANAGER_NOTE"
  | "FIELD_NOTE"
  | "WORK_START"
  | "WORK_END"
  | "FILE_UPLOAD"
  | "IMAGE_UPLOAD"
  | "LOCATION_EVENT";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  user: SessionUser;
}

export interface CustomerSummary {
  id: string;
  name: string;
  note: string | null;
  isArchived: boolean;
  projectCount?: number;
  createdAt?: string;
}

export interface MainFileVersion {
  id: string;
  versionNumber: number;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
  inlineUrl?: string;
}

export interface MainFileItem {
  id: string;
  title: string;
  scope: FileScope;
  versionCount: number;
  latestVersion: MainFileVersion;
  versions?: MainFileVersion[];
}

export interface TimelineFile {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
  inlineUrl?: string;
}

export interface TimelineEntry {
  id: string;
  projectId: string;
  entryType: ProjectEntryType;
  note: string | null;
  entryDate: string;
  createdAt: string;
  actor: SessionUser;
  files: TimelineFile[];
}

export interface ProjectSummary {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  isArchived: boolean;
  storageRoot: string;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary | null;
  mainFileCount: number;
  programUsageCount: number;
  timelineEntryCount?: number;
}

export interface ProjectDetail extends ProjectSummary {
  mainFiles: MainFileItem[];
  timeline: TimelineEntry[];
}

export interface ManagerUserSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  assignmentCount?: number;
  openSessionCount?: number;
  subscriptionCount?: number;
}

export interface WorkSessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
}

export interface FieldAssignedProjectSummary {
  assignmentId: string;
  dailyProgramProjectId: string;
  dailyProgramId: string;
  dailyProgramDate: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
  description: string | null;
  customerName: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  activeSession: WorkSessionSummary | null;
  mainFiles: MainFileItem[];
}

export interface FieldNotificationHistoryItem {
  id: string;
  title: string;
  message: string;
  type: NotificationCampaignType;
  createdAt: string;
  targetDate: string | null;
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  failureReason: string | null;
}

export interface FieldNotificationHistoryPage {
  items: FieldNotificationHistoryItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProgramAssignmentSummary {
  id: string;
  user: ManagerUserSummary;
  activeSession: WorkSessionSummary | null;
  lastLocation: LocationFeedItem | null;
}

export interface ProgramProjectSummary {
  id: string;
  assignmentId?: string;
  dailyProgramProjectId?: string;
  dailyProgramId?: string;
  dailyProgramDate?: string;
  projectId: string;
  projectName?: string;
  projectCode?: string | null;
  description?: string | null;
  activeSession?: WorkSessionSummary | null;
  mainFiles?: MainFileItem[];
  project: ProjectSummary;
  assignments: ProgramAssignmentSummary[];
  sortOrder?: number;
  dayEntries?: TimelineEntry[];
}

export interface DailyProgramDetail {
  id: string;
  date: string;
  managerNote: string | null;
  programProjects: ProgramProjectSummary[];
}

export interface DailyProgramMonthDaySummary {
  date: string;
  projectCount: number;
  userCount: number;
  note: string | null;
  projectNames: string[];
}

export interface LocationFeedItem {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
  actor: SessionUser;
  projectId: string;
  source: string;
}

export interface TrackingProjectPoint {
  projectId: string;
  projectName: string;
  locationLabel: string | null;
  latitude: number;
  longitude: number;
}

export interface TrackingOverview {
  selectedDate: string | null;
  activeSessions: Array<{
    assignmentId: string;
    user: ManagerUserSummary;
    project: ProjectSummary;
    startedAt: string;
  }>;
  recentLocations: LocationFeedItem[];
  projectLocations: TrackingProjectPoint[];
}

export interface ManagerDashboardSummaryCards {
  projectCount: number;
  assignedFieldCount: number;
  openSessionCount: number;
  activityCount: number;
  notificationCount: number;
}

export interface ManagerDashboardProgramProject {
  id: string;
  projectId: string;
  projectName: string;
  customerName: string | null;
  locationLabel: string | null;
  assignmentCount: number;
  activeSessionCount: number;
  noteCount: number;
  fileCount: number;
  latestActivityAt: string | null;
}

export interface ManagerDashboardActivity {
  id: string;
  projectId: string;
  projectName: string;
  entryType: ProjectEntryType;
  note: string | null;
  fileCount: number;
  createdAt: string;
  actor: SessionUser;
}

export interface ManagerDashboardActiveSession {
  assignmentId: string;
  startedAt: string;
  user: ManagerUserSummary;
  project: {
    id: string;
    name: string;
    customerName: string | null;
  };
}

export interface ManagerDashboardNotificationItem {
  id: string;
  type: NotificationCampaignType;
  title: string;
  message: string;
  targetDate: string | null;
  createdAt: string;
  deliveryCount: number;
  sentCount: number;
  failedCount: number;
}

export interface ManagerDashboardNotificationSummary {
  campaigns: ManagerDashboardNotificationItem[];
  totalCount: number;
  sentCount: number;
  failedCount: number;
}

export interface ManagerDashboardResponse {
  selectedDate: string;
  summaryCards: ManagerDashboardSummaryCards;
  programProjects: ManagerDashboardProgramProject[];
  recentActivities: ManagerDashboardActivity[];
  activeSessions: ManagerDashboardActiveSession[];
  notificationSummary: ManagerDashboardNotificationSummary;
}

export interface ManagerProjectDurationReportItem {
  projectId: string;
  projectName: string;
  firstProgramDate: string;
  lastProgramDate: string;
  totalVisitDays: number;
  totalUniqueFieldUsers: number;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationSubscriptionSummary {
  id: string;
  endpoint: string;
  userAgent: string | null;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface NotificationDeliverySummary {
  id: string;
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  failureReason: string | null;
  targetUser: ManagerUserSummary;
}

export interface NotificationCampaignSummary {
  id: string;
  type: NotificationCampaignType;
  title: string;
  message: string;
  targetDate: string | null;
  createdAt: string;
  sender: SessionUser;
  deliveries: NotificationDeliverySummary[];
}
