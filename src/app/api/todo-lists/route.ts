import { makeCollectionHandlers } from "@/lib/crud";
import { todoLists } from "@/db/schema";

export const { GET, POST } = makeCollectionHandlers(todoLists, { api: "todo-lists" });
