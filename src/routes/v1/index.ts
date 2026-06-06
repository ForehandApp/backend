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
import { supabase } from "@/services/supabase/client";
import Elysia from "elysia";

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
      async open(ws) {
        const token = ws.data.query.token;
        if (!token) {
          ws.send({
            type: "ERROR",
            message: "Unauthorized: No token provided",
          });
          ws.close();
          return;
        }

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(token);
        if (error || !user) {
          ws.send({ type: "ERROR", message: "Unauthorized: Invalid token" });
          ws.close();
          return;
        }

        // User authenticated
        (ws.data as any).user = user;
        ws.send({ type: "AUTH_SUCCESS", message: "Authenticated" });
        console.log(`WS: User ${user.id} connected`);
      },
      message(ws, message: any) {
        const user = (ws.data as any).user;
        if (!user) return;

        if (message.type === "SUBSCRIBE_MATCH") {
          const matchId = message.matchId;
          ws.subscribe(`match:${matchId}`);
          ws.send({ type: "SUBSCRIBED", matchId });
          console.log(`WS: User ${user.id} subscribed to match:${matchId}`);
        }

        if (message.type === "SUBSCRIBE_TOURNAMENT") {
          const tournamentId = message.tournamentId;
          ws.subscribe(`tournament:${tournamentId}`);
          ws.send({ type: "SUBSCRIBED_TOURNAMENT", tournamentId });
          console.log(
            `WS: User ${user.id} subscribed to tournament:${tournamentId}`,
          );
        }
      },
    }),
);
