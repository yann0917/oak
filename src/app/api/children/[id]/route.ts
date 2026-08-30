import { children } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(children, { api: "children" });
