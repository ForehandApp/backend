import cors from "@elysiajs/cors";
import Elysia from "elysia";
import { createHash } from "node:crypto";
import { supabase } from "@/services/supabase/client";
import { db } from "@/services/db/client";
import { logger } from "@rasla/logify";
import { sendResponse } from "@/utils/response";

const pendingAuthValidations = new Map<string, Promise<any>>();
const authValidationCache = new Map<
  string,
  {
    expiresAt: number;
    user: any;
  }
>();
const DEFAULT_AUTH_VALIDATION_CACHE_MS = 15_000;
const MAX_AUTH_VALIDATION_CACHE_MS = 60_000;
const AUTH_EXPIRY_BUFFER_MS = 30_000;
const configuredAuthCacheMs = Number(Bun.env.AUTH_VALIDATION_CACHE_MS);
const AUTH_VALIDATION_CACHE_MS = Number.isFinite(configuredAuthCacheMs)
  ? Math.max(0, Math.min(configuredAuthCacheMs, MAX_AUTH_VALIDATION_CACHE_MS))
  : DEFAULT_AUTH_VALIDATION_CACHE_MS;
const DEFAULT_ALLOWED_CORS_ORIGINS = [
  "https://forehandapp.com",
  "https://www.forehandapp.com",
  "https://frontend-silk-three-36.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];
const allowedCorsOrigins = new Set(
  (Bun.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_CORS_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function getTokenCacheKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function decodeBase64UrlJson(segment: string) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function getTokenExpiresAtMs(token: string) {
  try {
    const payload = decodeBase64UrlJson(token.split(".")[1] || "");
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function getCachedAuthUser(tokenKey: string) {
  if (AUTH_VALIDATION_CACHE_MS <= 0) return null;

  const cached = authValidationCache.get(tokenKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    authValidationCache.delete(tokenKey);
    return null;
  }

  return cached.user;
}

function cacheAuthUser(tokenKey: string, token: string, user: any) {
  if (AUTH_VALIDATION_CACHE_MS <= 0) return;

  const tokenExpiresAt = getTokenExpiresAtMs(token);
  if (!tokenExpiresAt) return;

  const expiresAt = Math.min(
    Date.now() + AUTH_VALIDATION_CACHE_MS,
    tokenExpiresAt - AUTH_EXPIRY_BUFFER_MS,
  );
  if (expiresAt <= Date.now()) return;

  authValidationCache.set(tokenKey, { expiresAt, user });
}

const baseApi = new Elysia()
  .use(logger())
  .use(
    cors({
      origin: (request) => {
        const origin = request.headers.get("origin");
        return !origin || allowedCorsOrigins.has(origin);
      },
      // The Elysia CORS preflight handler only emits this header when mirroring
      // requested headers, so keep it enabled for Authorization-bearing calls.
      allowedHeaders: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .decorate("supabase", supabase)
  .decorate("db", db)
  .onError(({ error, set }) => {
    set.status = 500;

    const errorBody = error as any;
    const message =
      errorBody?.message ||
      (typeof errorBody?.toString === "function"
        ? errorBody.toString()
        : "Internal Server Error");

    if (
      typeof message === "string" &&
      message.includes("invalid input syntax for type uuid")
    ) {
      set.status = 400;
      return sendResponse({
        success: false,
        message: "Invalid ID format. Expected a UUID.",
      });
    }
    return sendResponse({
      success: false,
      message: typeof message === "string" ? message : "Internal Server Error",
    });
  });

export const publicApi = baseApi;

export const protectedApi = baseApi
  .derive(async ({ request, supabase, status }) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return status(401, "Unauthorized");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return status(401, "Unauthorized");

    const tokenKey = getTokenCacheKey(token);
    const cachedUser = getCachedAuthUser(tokenKey);
    if (cachedUser) {
      return { user: cachedUser };
    }

    const existingValidation = pendingAuthValidations.get(tokenKey);
    const validation =
      existingValidation ??
      supabase.auth.getUser(token).finally(() => {
        pendingAuthValidations.delete(tokenKey);
      });

    if (!existingValidation) {
      pendingAuthValidations.set(tokenKey, validation);
    }

    const {
      data: { user },
      error,
    } = await validation;

    if (error || !user) return status(401, "Unauthorized");
    cacheAuthUser(tokenKey, token, user);

    return { user };
  })
  .as("global");
