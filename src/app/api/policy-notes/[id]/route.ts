import { policyNotes } from "@/db/schema";
import { makeItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = makeItemHandlers(policyNotes, { api: "policy-notes" });
