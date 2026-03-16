Implement a feature based on a Linear ticket.

Arguments: $ARGUMENTS - A Linear ticket URL (e.g., "https://linear.app/husky-ai/issue/HUSKY-123/ticket-title").

Steps:

1. **Find the ticket**:
   - Parse the ticket identifier from the URL. Extract the issue ID from the path — it follows `/issue/` (e.g., `HUSKY-123` from `https://linear.app/husky-ai/issue/HUSKY-123/ticket-title`).
   - Use `mcp__linear-server__get_issue` with the extracted identifier to fetch the ticket.
   - If the URL is invalid or the ticket is not found, tell the user and stop.

2. **Read ticket details**: Extract the title, description, acceptance criteria, and labels from the ticket.

3. **Read implementation plan**: Use `mcp__linear-server__list_comments` with the ticket's `issueId` to find any "## Implementation Plan" comment. This plan (created by `/plan-tickets`) contains the files to modify, key changes, and implementation order.

4. **Create a feature branch**: Create and checkout a new branch from `main` named `feature/<short-kebab-case-summary>` based on the ticket title (e.g., `feature/paste-from-clipboard`). If a branch already exists for this ticket, ask the user whether to use the existing branch or create a new one.

5. **Study the codebase**: Before writing any code, read the relevant files identified in the implementation plan. Understand the existing patterns, types, and conventions in those areas.

6. **Implement the feature**: Follow the implementation plan step by step. If no plan exists, analyze the ticket description and acceptance criteria to determine what needs to be done, then implement it. Follow all coding standards from CLAUDE.md.

7. **Verify the work**:
   - If the changes are in `/api`, run `cd api && npm run build` to check for TypeScript errors.
   - If the changes are in `/frontend`, run `cd frontend && npm run build` to check for build errors.
   - Fix any errors before proceeding.

8. **Update ticket status**: Use `mcp__linear-server__save_issue` to move the ticket to "In Progress" status.

9. **Summary**: Report what was implemented, which files were created/modified, and any remaining TODOs or follow-up items. Do NOT commit or push — let the user review the changes first.
