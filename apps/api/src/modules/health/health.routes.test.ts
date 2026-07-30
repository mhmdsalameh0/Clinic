import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

const testEnv = {
  NODE_ENV: "test" as const,
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: undefined,
  DIRECT_URL: undefined,
  JWT_ACCESS_SECRET: undefined,
  JWT_REFRESH_SECRET: undefined,
  COOKIE_SECRET: undefined,
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d"
};

describe("health routes", () => {
  it("returns root health status", async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "clinic-api",
      environment: "test"
    });

    await app.close();
  });

  it("returns versioned health status", async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "clinic-api",
      environment: "test"
    });

    await app.close();
  });
});
