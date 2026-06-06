import { publicApi } from "@/controller";
import { sendResponse } from "@/utils/response";

export const optionsRoutes = publicApi.group("/options", (app) =>
  app
    .get("/sports", async ({ db }) => {
      const sportsOptions = await db.query.sportsOptionsTable.findMany();

      return sendResponse({
        success: true,
        message: "Sports options retrieved successfully",
        data: sportsOptions,
      });
    })
    .get("/eventFormats", async ({ db }) => {
      const eventFormatOptions = await db.query.eventFormatsTable.findMany();

      return sendResponse({
        success: true,
        message: "Event formats retrieved successfully",
        data: eventFormatOptions,
      });
    })
    .get("/orgTypes", async ({ db }) => {
      const orgTypes = await db.query.orgTypesTable.findMany();

      return sendResponse({
        success: true,
        message: "Org types retrieved successfully",
        data: orgTypes,
      });
    })
    .get("/paymentModes", async ({ db }) => {
      const paymentModes = await db.query.paymentModesTable.findMany();

      return sendResponse({
        success: true,
        message: "Payment modes retrieved successfully",
        data: paymentModes,
      });
    })
    .get("/teamTypes", async ({ db }) => {
      const teamTypes = await db.query.teamTypesTable.findMany();

      return sendResponse({
        success: true,
        message: "Team types retrieved successfully",
        data: teamTypes,
      });
    }),
);
