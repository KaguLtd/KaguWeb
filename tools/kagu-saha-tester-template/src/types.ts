export type Role = "MANAGER" | "FIELD";

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type FindingCategory = "urun eksigi" | "ortam kisiti" | "kullanim sorunu";
export type EventStatus = "passed" | "failed" | "expected_failure" | "warning";
export type ArtifactType = "screenshot" | "chart" | "raw" | "report";

export interface TesterConfig {
  name: string;
  repoRoot: string;
  month: {
    startDate: string;
    endDate: string;
    uiCheckpoints: string[];
    halfDayWeekday: number;
    offDayWeekday: number;
  };
  runtime: {
    apiOrigin: string;
    apiBasePath: string;
    webOrigin: string;
    databaseUrl: string;
    storageRoot: string;
  };
  bootstrapAdmin: {
    username: string;
    displayName: string;
    password: string;
  };
  managerMobile: {
    username: string;
    displayName: string;
    password: string;
  };
  fieldPassword: string;
  sampleCoordinates: {
    baseLatitude: number;
    baseLongitude: number;
  };
}

export interface Persona {
  username: string;
  displayName: string;
  role: Role;
  device: "desktop" | "mobile";
  archetype: string;
  traits: string[];
  summary: string;
}

export interface ProjectBlueprint {
  code: string;
  name: string;
  description: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  anomaly?: boolean;
}

export interface SimulationEvent {
  id: string;
  date: string;
  actor: string;
  role: Role | "SYSTEM";
  projectCode: string | null;
  action: string;
  status: EventStatus;
  expected: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface UiCheckpointResult {
  id: string;
  date: string;
  actor: string;
  role: Role;
  device: "desktop" | "mobile";
  page: string;
  title: string;
  status: "passed" | "failed";
  screenshotPath: string;
  notes: string[];
}

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  detail: string;
  recommendation: string;
  evidence: string[];
}

export interface ArtifactRecord {
  type: ArtifactType;
  label: string;
  path: string;
}

export interface ReportData {
  generatedAt: string;
  workspaceRoot: string;
  repoRoot: string;
  month: {
    startDate: string;
    endDate: string;
    totalDays: number;
    workingDays: number;
    halfDays: number;
    offDays: number;
  };
  environment: {
    apiOrigin: string;
    webOrigin: string;
    databaseUrl: string;
    storageRoot: string;
    pushConfigured: boolean;
    secureContextExpected: boolean;
  };
  personas: Persona[];
  projects: ProjectBlueprint[];
  events: SimulationEvent[];
  uiResults: UiCheckpointResult[];
  findings: Finding[];
  technicalAudit: Finding[];
  artifacts: ArtifactRecord[];
  metrics: {
    totalEvents: number;
    passedEvents: number;
    expectedFailures: number;
    warnings: number;
    unexpectedFailures: number;
    notesCreated: number;
    filesUploaded: number;
    downloadsAttempted: number;
    locationPings: number;
    notificationsSent: number;
    notificationFailures: number;
    workStarts: number;
    workEnds: number;
    projectCreateAttempts: number;
    projectDeleteAttempts: number;
  };
  daily: Array<{
    date: string;
    weekday: string;
    mode: "full-day" | "half-day" | "off-day";
    events: number;
    passes: number;
    expectedFailures: number;
    unexpectedFailures: number;
    projectCount: number;
    assignmentCount: number;
    noteCount: number;
    fileCount: number;
    pingCount: number;
    notificationCount: number;
  }>;
  personaScores: Array<{
    username: string;
    displayName: string;
    completedActions: number;
    failedActions: number;
    expectedFailures: number;
    uiPassCount: number;
    uiFailCount: number;
    qualitative: string;
  }>;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
  };
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
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
}

export interface MainFileVersion {
  id: string;
  versionNumber: number;
  originalName: string;
  downloadUrl: string;
}

export interface MainFileItem {
  id: string;
  title: string;
  versionCount: number;
  latestVersion: MainFileVersion;
}

export interface DailyProgramDetail {
  id: string;
  date: string;
  managerNote: string | null;
  programProjects: ProgramProjectSummary[];
}

export interface ProgramProjectSummary {
  id: string;
  projectId: string;
  projectName?: string;
  projectCode?: string | null;
  project: ProjectSummary;
  assignments: Array<{
    id: string;
    user: UserSummary;
    activeSession: { id: string; startedAt: string; endedAt: string | null } | null;
    lastLocation: {
      id: string;
      latitude: number;
      longitude: number;
      accuracy: number | null;
      capturedAt: string;
      source: string;
    } | null;
  }>;
  dayEntries?: TimelineEntry[];
}

export interface TimelineEntry {
  id: string;
  entryType: string;
  note: string | null;
  createdAt: string;
  entryDate: string;
  files: Array<{
    id: string;
    originalName: string;
    downloadUrl: string;
  }>;
}

export interface ManagerDashboardResponse {
  selectedDate: string;
  summaryCards: {
    projectCount: number;
    assignedFieldCount: number;
    openSessionCount: number;
    activityCount: number;
    notificationCount: number;
  };
  programProjects: Array<{
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
  }>;
  notificationSummary: {
    totalCount: number;
    sentCount: number;
    failedCount: number;
  };
}

export interface TrackingOverview {
  selectedDate: string | null;
  activeSessions: Array<{
    assignmentId: string;
  }>;
  recentLocations: Array<{
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    capturedAt: string;
    projectId: string;
    source: string;
    actor: {
      id: string;
      displayName: string;
      username: string;
      role: Role;
    };
  }>;
  projectLocations: Array<{
    projectId: string;
    projectName: string;
    locationLabel: string | null;
    latitude: number;
    longitude: number;
  }>;
}
