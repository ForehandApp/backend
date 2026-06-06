import Elysia from "elysia";
import { seed } from "@/services/db/seed";
import { apiV1 } from "./routes/v1";

const port = process.env.PORT || 8000;

seed()
  .then(() => {
    console.log("Values Loaded on Database");
    const app = new Elysia()
      .get("/", () => "Hello World")
      .use(apiV1)
      .onStart(({ server }) => console.log(`Server started on ${server?.url}`))
      .listen(port);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
