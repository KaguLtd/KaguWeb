import type {
  AuthResponse,
  DailyProgramDetail,
  MainFileItem,
  ManagerDashboardResponse,
  ProgramProjectSummary,
  ProjectSummary,
  TrackingOverview,
  UserSummary
} from "./types.js";
import { apiUrl } from "./utils.js";
import type { TesterConfig } from "./types.js";

export class ApiClient {
  constructor(
    private readonly config: TesterConfig,
    private readonly token?: string
  ) {}

  withToken(token: string) {
    return new ApiClient(this.config, token);
  }

  async login(username: string, password: string) {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  }

  async listUsers(query = "") {
    return this.request<UserSummary[]>(`/users${query ? `?${query}` : ""}`);
  }

  async createUser(payload: {
    username: string;
    displayName: string;
    password: string;
    role: "MANAGER" | "FIELD";
  }) {
    return this.request<UserSummary>("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async listProjects(query = "") {
    return this.request<ProjectSummary[]>(`/projects${query ? `?${query}` : ""}`);
  }

  async createProject(payload: {
    customerId?: string;
    name: string;
    code: string;
    description: string;
    locationLabel: string;
    latitude: number;
    longitude: number;
  }) {
    return this.request<ProjectSummary>("/projects", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async updateProject(projectId: string, payload: Record<string, unknown>) {
    return this.request<ProjectSummary>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  async deleteProject(projectId: string) {
    return this.request<{ success: true }>(`/projects/${projectId}`, {
      method: "DELETE"
    });
  }

  async uploadMainFiles(projectId: string, formData: FormData) {
    return this.request<MainFileItem[]>(`/projects/${projectId}/main-files`, {
      method: "POST",
      body: formData
    });
  }

  async listMainFiles(projectId: string) {
    return this.request<MainFileItem[]>(`/projects/${projectId}/main-files`);
  }

  async createDailyProgram(date: string) {
    return this.request<{ id: string }>("/daily-programs", {
      method: "POST",
      body: JSON.stringify({ date })
    });
  }

  async getDailyProgram(date: string) {
    return this.request<DailyProgramDetail | null>(`/daily-programs/${date}`);
  }

  async updateProgramNote(programId: string, managerNote: string) {
    return this.request(`/daily-programs/${programId}/note`, {
      method: "PATCH",
      body: JSON.stringify({ managerNote })
    });
  }

  async addProjectToProgram(programId: string, payload: { projectId: string; note?: string }) {
    return this.request(`/daily-programs/${programId}/projects`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async removeProjectFromProgram(programProjectId: string) {
    return this.request(`/program-projects/${programProjectId}`, {
      method: "DELETE"
    });
  }

  async reorderProgram(programId: string, orderedIds: string[]) {
    return this.request(`/daily-programs/${programId}/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedIds })
    });
  }

  async assignUsers(programProjectId: string, userIds: string[]) {
    return this.request<ProgramProjectSummary["assignments"]>(
      `/program-projects/${programProjectId}/assignments`,
      {
        method: "POST",
        body: JSON.stringify({ userIds })
      }
    );
  }

  async workStart(assignmentId: string, payload: Record<string, unknown>) {
    return this.request(`/assignments/${assignmentId}/work-start`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async workEnd(assignmentId: string, payload: Record<string, unknown>) {
    return this.request(`/assignments/${assignmentId}/work-end`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createEntry(programProjectId: string, formData: FormData) {
    return this.request(`/program-projects/${programProjectId}/entries`, {
      method: "POST",
      body: formData
    });
  }

  async createLocationPing(assignmentId: string, payload: Record<string, unknown>) {
    return this.request(`/assignments/${assignmentId}/location-pings`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getAssignments() {
    return this.request<
      Array<{
        assignmentId: string;
        dailyProgramProjectId: string;
        dailyProgramDate: string;
        projectId: string;
        projectName: string;
        projectCode: string | null;
        activeSession: { id: string; startedAt: string; endedAt: string | null } | null;
        mainFiles: MainFileItem[];
      }>
    >("/me/program-projects");
  }

  async getManagerOverview(date: string) {
    return this.request<ManagerDashboardResponse>(`/dashboard/manager?date=${date}`);
  }

  async getTrackingOverview(date: string) {
    return this.request<TrackingOverview>(`/tracking/overview?date=${date}`);
  }

  async getTrackingHistory(date: string, projectId?: string, userId?: string) {
    const params = new URLSearchParams({ date });
    if (projectId) {
      params.set("projectId", projectId);
    }
    if (userId) {
      params.set("userId", userId);
    }
    return this.request<Array<{ id: string }>>(`/tracking/history?${params.toString()}`);
  }

  async getNotificationConfig() {
    return this.request<{ enabled: boolean; publicKey: string | null }>("/notifications/public-key");
  }

  async listNotificationCampaigns() {
    return this.request<
      Array<{
        id: string;
        type: string;
        deliveries: Array<{ status: string; failureReason: string | null }>;
      }>
    >("/notifications/campaigns");
  }

  async sendManualNotification(title: string, message: string, userIds: string[]) {
    return this.request("/notifications/manual", {
      method: "POST",
      body: JSON.stringify({ title, message, userIds })
    });
  }

  async sendDailyReminder(date: string) {
    return this.request("/notifications/daily-reminder", {
      method: "POST",
      body: JSON.stringify({ date })
    });
  }

  async download(downloadPath: string) {
    const response = await fetch(apiUrl(this.config, downloadPath.replace(/^\/api/, "")), {
      headers: this.buildHeaders(undefined)
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async request<T>(pathname: string, init: RequestInit = {}) {
    const response = await fetch(apiUrl(this.config, pathname), {
      ...init,
      headers: this.buildHeaders(init.body, init.headers)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `${pathname} failed`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private buildHeaders(body?: BodyInit | null, headers?: HeadersInit) {
    const built = new Headers(headers);
    if (this.token) {
      built.set("Authorization", `Bearer ${this.token}`);
    }
    if (!(body instanceof FormData) && !built.has("Content-Type")) {
      built.set("Content-Type", "application/json");
    }
    return built;
  }
}
