import { timetableSlots } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(timetableSlots, { api: "timetable-slots" });
