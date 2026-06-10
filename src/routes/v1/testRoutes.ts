import { protectedApi, publicApi } from "@/routes/v1/controller";
import { sendResponse } from "@/utils/response";

export const publicTestingRoutes = publicApi.get("/test/public", () => {
  return sendResponse({
    success: true,
    message: "Public access successful",
  });
});

export const protectedTestingRoutes = protectedApi.get(
  "/test/protected",
  () => {
    return sendResponse({
      success: true,
      message: "Authorization successful",
    });
  },
);
