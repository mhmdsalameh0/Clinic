import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("Next API proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_PROXY_ORIGIN;
  });

  it("forwards /api/v1 requests correctly when API_PROXY_ORIGIN ends with /api", async () => {
    process.env.API_PROXY_ORIGIN = "https://clinic-api-7ial.vercel.app/api";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true }, error: null }), {
      status: 200,
      headers: { "Set-Cookie": "access_token=abc; HttpOnly" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://clinic-web-beryl-two.vercel.app/api/v1/auth/me"), { params: Promise.resolve({ path: ["api", "v1", "auth", "me"] }) });

    expect(fetchMock).toHaveBeenCalledWith("https://clinic-api-7ial.vercel.app/api/v1/auth/me", expect.objectContaining({ cache: "no-store" }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Set-Cookie")).toContain("access_token");
  });

  it("keeps login working through the proxy", async () => {
    process.env.API_PROXY_ORIGIN = "https://clinic-api-7ial.vercel.app/api";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { user: { id: "user_1" } }, error: null }), {
      status: 200,
      headers: { "Set-Cookie": "refresh_token=abc; HttpOnly" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("https://clinic-web-beryl-two.vercel.app/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "Password123!" }),
      headers: { "Content-Type": "application/json" }
    }), { params: Promise.resolve({ path: ["api", "v1", "auth", "login"] }) });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith("https://clinic-api-7ial.vercel.app/api/v1/auth/login", expect.objectContaining({ method: "POST" }));
  });
});
