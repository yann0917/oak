import { feeRecords } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(feeRecords, { api: "fee-records" });
