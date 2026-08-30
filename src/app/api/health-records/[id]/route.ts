import { healthRecords } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(healthRecords, { api: "health-records" });
