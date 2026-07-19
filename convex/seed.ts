import { mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

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

// Clears every workflow row so the demo starts from a clean slate. Leaves the
// policies table alone (the b50,000 limit must survive). Run this once before
// the demo, or any time the tables fill up with test runs.
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "requests",
      "evaluations",
      "approvals",
      "auditLog",
      "externalActions",
    ] as const;
    let deleted = 0;
    for (const table of tables) {
      const rows: Doc<typeof table>[] = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { deleted, note: "policies table left intact" };
  },
});
