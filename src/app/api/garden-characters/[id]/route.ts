import { gardenCharacters } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

// PUT 改档（body.tier）/ DELETE 删字
export const { GET, PUT, DELETE } = makeItemHandlers(gardenCharacters, { api: "garden-characters" });
