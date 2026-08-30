import { timetableSlots } from "@/db/schema";
import { makeCollectionHandlers } from "@/lib/crud";

export const { GET, POST } = makeCollectionHandlers(timetableSlots, { childScoped: true, api: "timetable-slots" });
