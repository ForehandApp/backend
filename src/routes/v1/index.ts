import { userRoutes } from "@/routes/v1/userRoutes";
import { orgRoutes } from "@/routes/v1/orgRoutes";
import { storageRoutes } from "@/routes/v1/storageRoutes";
import { optionsRoutes } from "@/routes/v1/optionsRoutes";
import { tournamentRoutes } from "@/routes/v1/tournamentRoutes";
import { eventRoutes } from "@/routes/v1/eventRoutes";
import { teamRoutes } from "@/routes/v1/teamRoutes";
import { matchRoutes } from "@/routes/v1/matchRoutes";
import { inviteRoutes } from "@/routes/v1/inviteRoutes";
import {
  publicTestingRoutes,
  protectedTestingRoutes,
} from "@/routes/v1/testRoutes";
import { db } from "@/services/db/client";
import { supabase } from "@/services/supabase/client";
import { canViewMatch, canViewTournament } from "@/utils/access";
import Elysia from "elysia";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function sendWsError(ws: any, message: string) {
  ws.send(JSON.stringify({ type: "ERROR", message }));
}

async function authenticateWs(ws: any, token: string) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    sendWsError(ws, "Unauthorized: Invalid token");
    ws.close();
    return null;
  }

  (ws.data as any).user = user;
  ws.send(JSON.stringify({ type: "AUTH_SUCCESS", message: "Authenticated" }));
  return user;
}

export const apiV1 = new Elysia().group("v1", (app) =>
  app
    .use(publicTestingRoutes)
    .use(userRoutes)
    .use(orgRoutes)
    .use(tournamentRoutes)
    .use(eventRoutes)
    .use(teamRoutes)
    .use(matchRoutes)
    .use(inviteRoutes)
    .use(storageRoutes)
    .use(optionsRoutes)
    .use(protectedTestingRoutes)
    .ws("/ws", {
      async message(ws, message: any) {
        let payload: any;

        try {
          payload = typeof message === "string" ? JSON.parse(message) : message;
        } catch {
          sendWsError(ws, "Invalid websocket message");
          return;
        }

        if (payload.type === "AUTH") {
          const token = typeof payload.token === "string" ? payload.token : "";
          if (!token) {
            sendWsError(ws, "Unauthorized: No token provided");
            ws.close();
            return;
          }
          await authenticateWs(ws, token);
          return;
        }

        const user = (ws.data as any).user;
        if (!user) {
          sendWsError(ws, "Unauthorized: Authenticate before subscribing");
          ws.close();
          return;
        }

        if (payload.type === "SUBSCRIBE_MATCH") {
          const matchId = payload.matchId;
          if (!isUuid(matchId)) {
            sendWsError(ws, "Invalid match ID");
            return;
          }

          const allowed = await canViewMatch(db, user.id, matchId);
          if (!allowed) {
            sendWsError(ws, "Unauthorized: Cannot access this match");
            return;
          }

          ws.subscribe(`match:${matchId}`);
          ws.send(JSON.stringify({ type: "SUBSCRIBED", matchId }));
        }

        if (payload.type === "SUBSCRIBE_TOURNAMENT") {
          const tournamentId = payload.tournamentId;
          if (!isUuid(tournamentId)) {
            sendWsError(ws, "Invalid tournament ID");
            return;
          }

          const allowed = await canViewTournament(db, user.id, tournamentId);
          if (!allowed) {
            sendWsError(ws, "Unauthorized: Cannot access this tournament");
            return;
          }

          ws.subscribe(`tournament:${tournamentId}`);
          ws.send(JSON.stringify({ type: "SUBSCRIBED_TOURNAMENT", tournamentId }));
        }
      },
    }),
);
