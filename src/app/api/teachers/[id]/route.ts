import { teachers } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(teachers, { api: "teachers" });
