import { childTeachers } from "@/db/schema";
import { makeCollectionHandlers } from "@/lib/crud";

export const { GET, POST } = makeCollectionHandlers(childTeachers, { childScoped: true, api: "child-teachers" });
