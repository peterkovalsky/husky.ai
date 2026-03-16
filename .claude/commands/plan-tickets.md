Fetch Todo tickets from "Husky AI - Dev" in Linear and create implementation plans for each.

Steps:

1. **Fetch Todo tickets**: Use `mcp__linear-server__list_issues` with `project: "Husky AI - Dev"` and `state: "Todo"` to get all tickets in Todo status.

2. **Process each ticket sequentially**. For each ticket, determine which category it falls into:

   ### Category A: Ticket has NO labels (or labels other than "needs clarification" / "plan ready")
   This is a new ticket that needs planning.
   - Read the ticket title and description carefully.
   - Study the codebase to understand what files/areas would need to change. Use the Explore agent or read relevant files.
   - Determine if you have enough information to create a full implementation plan. Consider:
     - Is the scope clear?
     - Are the acceptance criteria specific enough?
     - Do you know which files/components need changes?
     - Are there any ambiguous requirements?
   - **If you have questions:**
     - Post a comment on the ticket using `mcp__linear-server__save_comment` with your questions formatted as a numbered list under a "## Questions" heading.
     - Add the label "needs clarification" to the ticket using `mcp__linear-server__save_issue` with the ticket `id` and `labels: ["needs clarification"]`.
   - **If everything is clear:**
     - Post a comment with the full implementation plan under a "## Implementation Plan" heading. Include:
       - Files to create/modify
       - Key changes in each file
       - Order of implementation steps
       - Any edge cases to handle
     - Add the label "plan ready" using `mcp__linear-server__save_issue` with `labels: ["plan ready"]`.

   ### Category B: Ticket has "needs clarification" label
   This ticket had questions asked previously — check if they've been answered.
   - Use `mcp__linear-server__list_comments` with the ticket's `issueId` to read all comments.
   - Find your original questions comment and check if there are subsequent replies answering them.
   - **If questions are NOT answered (no new replies, or replies don't address the questions):**
     - Post a follow-up comment asking for clarification again or refining the questions.
     - Keep the "needs clarification" label.
   - **If questions ARE answered:**
     - Post a comment with the full implementation plan (same format as above).
     - Update the ticket labels: remove "needs clarification" and add "plan ready" using `mcp__linear-server__save_issue` with `labels: ["plan ready"]`.

   ### Category C: Ticket has "plan ready" label
   Skip this ticket — it's already planned.

3. **Report summary**: After processing all tickets, output a summary table:
   - Ticket identifier and title
   - Action taken (plan created / questions asked / questions re-asked / skipped)
   - Current label status
