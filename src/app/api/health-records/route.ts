import { healthRecords } from "@/db/schema";
import { makeCollectionHandlers } from "@/lib/crud";

export const { GET, POST } = makeCollectionHandlers(healthRecords, { childScoped: true, api: "health-records" });
