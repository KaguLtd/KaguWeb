import type { FieldAssignedProjectSummary, FieldNotificationHistoryPage, TimelineEntry } from "@kagu/contracts";

const DATABASE_NAME = "kagu-field-offline";
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const OUTBOX_STORE = "outbox";

type SnapshotKey = "assignments" | "notifications" | `timeline:${string}`;

type SnapshotRecord<TValue> = {
  key: SnapshotKey;
  value: TValue;
  updatedAt: string;
};

export type FieldOutboxEntry =
  | {
      id: string;
      type: "work-start";
      assignmentId: string;
      projectId: string;
      createdAt: string;
      attemptCount?: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
      lastError?: string | null;
      payload: {
        latitude?: number;
        longitude?: number;
      };
    }
  | {
      id: string;
      type: "work-end";
      assignmentId: string;
      projectId: string;
      createdAt: string;
      attemptCount?: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
      lastError?: string | null;
      payload: {
        latitude?: number;
        longitude?: number;
      };
    }
  | {
      id: string;
      type: "field-entry";
      dailyProgramProjectId: string;
      projectId: string;
      createdAt: string;
      attemptCount?: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
      lastError?: string | null;
      payload: {
        note: string;
      };
    }
  | {
      id: string;
      type: "location-ping";
      assignmentId: string;
      projectId: string;
      createdAt: string;
      attemptCount?: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
      lastError?: string | null;
      payload: {
        latitude: number;
        longitude: number;
        accuracy?: number;
        source?: string;
      };
    };

function hasIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase() {
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    if (!hasIndexedDb()) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outboxStore = database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        outboxStore.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB acilamadi."));
  });
}

function runRequest<TValue>(request: IDBRequest<TValue>) {
  return new Promise<TValue>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB istegi basarisiz."));
  });
}

async function withStore<TValue>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<TValue>
) {
  const database = await openDatabase();
  if (!database) {
    return null as TValue;
  }

  try {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return await action(store);
  } finally {
    database.close();
  }
}

async function setSnapshot<TValue>(key: SnapshotKey, value: TValue) {
  await withStore(SNAPSHOT_STORE, "readwrite", async (store) => {
    await runRequest(
      store.put({
        key,
        value,
        updatedAt: new Date().toISOString()
      } satisfies SnapshotRecord<TValue>)
    );
  });
}

async function getSnapshot<TValue>(key: SnapshotKey) {
  const record = await withStore(SNAPSHOT_STORE, "readonly", async (store) => {
    return runRequest(store.get(key));
  });

  return (record as SnapshotRecord<TValue> | undefined)?.value ?? null;
}

export async function saveAssignmentsSnapshot(assignments: FieldAssignedProjectSummary[]) {
  await setSnapshot("assignments", assignments);
}

export async function loadAssignmentsSnapshot() {
  return getSnapshot<FieldAssignedProjectSummary[]>("assignments");
}

export async function saveNotificationHistorySnapshot(page: FieldNotificationHistoryPage) {
  await setSnapshot("notifications", page);
}

export async function loadNotificationHistorySnapshot() {
  return getSnapshot<FieldNotificationHistoryPage>("notifications");
}

export async function saveTimelineSnapshot(projectId: string, timeline: TimelineEntry[]) {
  await setSnapshot(`timeline:${projectId}`, timeline);
}

export async function loadTimelineSnapshot(projectId: string) {
  return getSnapshot<TimelineEntry[]>(`timeline:${projectId}`);
}

export async function enqueueFieldOutboxEntry(entry: FieldOutboxEntry) {
  await withStore(OUTBOX_STORE, "readwrite", async (store) => {
    await runRequest(
      store.put({
        ...entry,
        attemptCount: entry.attemptCount ?? 0,
        lastAttemptAt: entry.lastAttemptAt ?? null,
        nextAttemptAt: entry.nextAttemptAt ?? null,
        lastError: entry.lastError ?? null
      })
    );
  });
}

export async function listFieldOutboxEntries() {
  const entries = await withStore(OUTBOX_STORE, "readonly", async (store) => {
    return runRequest(store.getAll());
  });

  return ((entries as FieldOutboxEntry[] | null) ?? []).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

export async function removeFieldOutboxEntry(id: string) {
  await withStore(OUTBOX_STORE, "readwrite", async (store) => {
    await runRequest(store.delete(id));
  });
}

export async function updateFieldOutboxEntry(
  id: string,
  patch: Partial<
    Pick<FieldOutboxEntry, "attemptCount" | "lastAttemptAt" | "nextAttemptAt" | "lastError">
  >
) {
  await withStore(OUTBOX_STORE, "readwrite", async (store) => {
    const current = (await runRequest(store.get(id))) as FieldOutboxEntry | undefined;
    if (!current) {
      return;
    }

    await runRequest(
      store.put({
        ...current,
        ...patch
      })
    );
  });
}

export async function getFieldOutboxCount() {
  const count = await withStore(OUTBOX_STORE, "readonly", async (store) => {
    return runRequest(store.count());
  });

  return count ?? 0;
}
