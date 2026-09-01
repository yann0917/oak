import { makeItemHandlers } from "@/lib/crud";
import { familySops } from "@/db/schema";

export const { GET, PUT, DELETE } = makeItemHandlers(familySops, { api: "family-sops" });
