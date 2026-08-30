import { learningRecords } from "@/db/schema";
import { makeCollectionHandlers } from "@/lib/crud";

export const { GET, POST } = makeCollectionHandlers(learningRecords, { childScoped: true, api: "learning-records" });
