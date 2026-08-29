import { moments } from "@/db/schema";
import { makeCollectionHandlers } from "@/lib/crud";

export const { GET, POST } = makeCollectionHandlers(moments, { childScoped: true });
