type RefreshReason = "interval" | "focus" | "visible" | "online" | "active";

type LiveRevalidatorOptions = {
  refresh: (signal: AbortSignal, reason: RefreshReason) => Promise<void>;
  intervalMs?: number;
  documentRef?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  windowRef?: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
};

export type LiveRevalidator = {
  start: () => void;
  stop: () => void;
  refreshNow: (reason?: RefreshReason) => Promise<void>;
};

export function createLiveRevalidator({
  refresh,
  intervalMs = 2000,
  documentRef = globalThis.document,
  windowRef = globalThis.window
}: LiveRevalidatorOptions): LiveRevalidator {
  let intervalId: ReturnType<Window["setInterval"]> | null = null;
  let abortController: AbortController | null = null;
  let isInFlight = false;
  let isStarted = false;

  const isVisible = () => !documentRef || documentRef.visibilityState === "visible";

  async function refreshNow(reason: RefreshReason = "active") {
    if (!isVisible() || isInFlight) return;
    abortController = new AbortController();
    isInFlight = true;
    try {
      await refresh(abortController.signal, reason);
    } finally {
      isInFlight = false;
      abortController = null;
    }
  }

  function handleVisibility() {
    if (isVisible()) void refreshNow("visible");
  }

  function handleFocus() {
    void refreshNow("focus");
  }

  function handleOnline() {
    void refreshNow("online");
  }

  function start() {
    if (isStarted) return;
    isStarted = true;
    void refreshNow("active");
    intervalId = windowRef?.setInterval(() => {
      void refreshNow("interval");
    }, intervalMs) ?? null;
    documentRef?.addEventListener("visibilitychange", handleVisibility);
    windowRef?.addEventListener("focus", handleFocus);
    windowRef?.addEventListener("online", handleOnline);
  }

  function stop() {
    if (!isStarted) return;
    isStarted = false;
    if (intervalId) {
      windowRef?.clearInterval(intervalId);
      intervalId = null;
    }
    abortController?.abort();
    documentRef?.removeEventListener("visibilitychange", handleVisibility);
    windowRef?.removeEventListener("focus", handleFocus);
    windowRef?.removeEventListener("online", handleOnline);
  }

  return { start, stop, refreshNow };
}
