import { makeCollectionHandlers } from "@/lib/crud";
import { bills } from "@/db/schema";

export const { GET, POST } = makeCollectionHandlers(bills, { childScoped: true, api: "bills" });
