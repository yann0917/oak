import { growthRecords } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(growthRecords, { api: "growth-records" });
