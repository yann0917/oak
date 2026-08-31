import { makeItemHandlers } from "@/lib/crud";
import { certArchives } from "@/db/schema";

export const { GET, PUT, DELETE } = makeItemHandlers(certArchives, { api: "cert-archives" });
