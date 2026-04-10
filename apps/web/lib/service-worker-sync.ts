export const FIELD_OUTBOX_SYNC_TAG = "kagu-field-outbox";
const FLUSH_FIELD_OUTBOX_MESSAGE = "KAGU_SYNC_FIELD_OUTBOX";

type ServiceWorkerMessage = {
  type?: string;
  source?: string;
};

export async function requestFieldOutboxSync() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));

    if ("sync" in registration) {
      await (registration as ServiceWorkerRegistration & {
        sync: {
          register: (tag: string) => Promise<void>;
        };
      }).sync.register(FIELD_OUTBOX_SYNC_TAG);
      return true;
    }

    registration.active?.postMessage({
      type: FLUSH_FIELD_OUTBOX_MESSAGE,
      source: "window-fallback"
    } satisfies ServiceWorkerMessage);
    return false;
  } catch {
    return false;
  }
}

export function registerFieldOutboxSyncListener(callback: () => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }

  const onMessage = (event: MessageEvent<ServiceWorkerMessage>) => {
    if (event.data?.type !== FLUSH_FIELD_OUTBOX_MESSAGE) {
      return;
    }

    callback();
  };

  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
  };
}
