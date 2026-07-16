import { mutation } from "./_generated/server";

// Inserts the one policy row the demo needs. Idempotent: running it twice
// does not duplicate the row (CLAUDE.md Phase 1 "Done when").
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("policies")
      .withIndex("by_category", (q) => q.eq("category", "marketing_campaign"))
      .first();
    if (existing !== null) {
      return { seeded: false, policyId: existing._id };
    }
    const policyId = await ctx.db.insert("policies", {
      category: "marketing_campaign",
      limit: 50000,
      description:
        "Marketing campaign spend up to Rs 50,000 is auto-approved. Anything above requires a human exception from the board.",
    });
    return { seeded: true, policyId };
  },
});
