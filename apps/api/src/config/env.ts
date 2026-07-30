import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  COOKIE_SECRET: z.string().optional(),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d")
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production") {
    for (const key of ["DATABASE_URL", "DIRECT_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "COOKIE_SECRET"] as const) {
      if (!value[key]) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
