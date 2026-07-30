import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./api-client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses no-store cache mode for authenticated API requests", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { items: [], total: 0, page: 1, pageSize: 20, pageCount: 0 }, error: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.doctors();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/doctors"), expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
  });
});
