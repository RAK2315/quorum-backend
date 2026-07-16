import { query } from "./_generated/server";
import { v } from "convex/values";

// The full audit feed, newest first. This is the traceability pillar and the
// centerpiece of the demo (CLAUDE.md §2.5). Built before anything renders it.
export const recent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditLog").order("desc").collect();
  },
});

// The audit trail for one request, oldest first, so it reads as a story:
// marketing requested -> finance evaluated -> system escalated -> human
// decided -> slack fired.
export const forRequest = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    return await ctx.db
      .query("auditLog")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .order("asc")
      .collect();
  },
});
