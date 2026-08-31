import { makeItemHandlers } from "@/lib/crud";
import { bills } from "@/db/schema";

export const { GET, PUT, DELETE } = makeItemHandlers(bills, { api: "bills" });
