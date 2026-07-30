import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveRevalidator } from "./live-refresh";

function createEventTarget<T extends string>() {
  const listeners = new Map<T, Array<() => void>>();
  return {
    addEventListener: vi.fn((event: T, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    removeEventListener: vi.fn((event: T, listener: () => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener));
    }),
    emit(event: T) {
      for (const listener of listeners.get(event) ?? []) listener();
    }
  };
}

describe("live revalidator", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls every two seconds while visible and prevents overlapping refreshes", async () => {
    vi.useFakeTimers();
    const documentRef = { visibilityState: "visible" as Document["visibilityState"], ...createEventTarget<"visibilitychange">() };
    const windowRef = { ...createEventTarget<"focus" | "online">(), setInterval, clearInterval };
    let resolveRefresh: () => void = () => undefined;
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    }));

    const revalidator = createLiveRevalidator({ refresh, documentRef, windowRef });
    revalidator.start();
    await vi.advanceTimersByTimeAsync(4000);

    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh();
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    revalidator.stop();
  });

  it("pauses when hidden and refreshes on visibility, focus, and online events", async () => {
    vi.useFakeTimers();
    const documentRef = { visibilityState: "hidden" as Document["visibilityState"], ...createEventTarget<"visibilitychange">() };
    const windowRef = { ...createEventTarget<"focus" | "online">(), setInterval, clearInterval };
    const refresh = vi.fn(async () => undefined);

    const revalidator = createLiveRevalidator({ refresh, documentRef, windowRef });
    revalidator.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).not.toHaveBeenCalled();

    documentRef.visibilityState = "visible";
    documentRef.emit("visibilitychange");
    await Promise.resolve();
    windowRef.emit("focus");
    await Promise.resolve();
    windowRef.emit("online");
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(3);
    revalidator.stop();
    expect(documentRef.removeEventListener).toHaveBeenCalled();
    expect(windowRef.removeEventListener).toHaveBeenCalled();
  });
});
