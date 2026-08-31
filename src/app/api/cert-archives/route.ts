import { makeCollectionHandlers } from "@/lib/crud";
import { certArchives } from "@/db/schema";

export const { GET, POST } = makeCollectionHandlers(certArchives, { api: "cert-archives" });
