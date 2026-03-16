Create a Linear ticket for the Husky AI team based on the user's description.

Arguments: $ARGUMENTS - Free text description of what needs to be done.

Steps:
1. Use the provided description from $ARGUMENTS to understand what the ticket is about.
2. Determine the ticket category:
   - **Dev tickets** (features, bugs, refactoring, infrastructure, API, frontend, database, deployments, technical debt) → assign to project "Husky AI - Dev"
   - **Marketing tickets** (landing page copy, SEO, social media, blog posts, analytics, branding, campaigns, user acquisition) → assign to project "Husky AI - Marketing"
3. Create the ticket using `mcp__linear-server__save_issue` with:
   - `team`: "Husky AI"
   - `project`: "Husky AI - Dev" or "Husky AI - Marketing" based on category
   - `title`: Short, descriptive title (under 80 characters)
   - `priority`: 3 (Medium) unless the user specifies urgency
   - `description`: Markdown formatted with:
     - `## Problem` - What issue or need this addresses
     - `## Solution` - Proposed approach
     - `## Acceptance Criteria` - Checklist of done conditions
4. Return the ticket identifier and URL to the user.
