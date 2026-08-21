import cors from "@elysiajs/cors";
import Elysia from "elysia";
import { supabase } from "@/services/supabase/client";
import { db } from "@/services/db/client";
import { logger } from "@rasla/logify";
import { sendResponse } from "@/utils/response";

const baseApi = new Elysia()
  .use(logger())
  .use(cors())
  .decorate("supabase", supabase)
  .decorate("db", db)
  .onError(({ error, set }) => {
    console.error("API Error:", error);
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

    const token = authHeader.split(" ")[1];
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return status(401, "Unauthorized");

    return { user };
  })
  .as("global");
