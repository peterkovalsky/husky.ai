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
4. **Attachments**: If the user included any images or screenshots in their message, attach them to the created ticket:
   - Read each image file using the Read tool to get its contents
   - Convert to base64 and upload using `mcp__linear-server__create_attachment` with:
     - `issue`: The ticket identifier from step 3 (e.g., "HUS-14")
     - `base64Content`: The base64-encoded image data
     - `filename`: A descriptive filename (e.g., "reference-screenshot.png")
     - `contentType`: The correct MIME type (e.g., "image/png", "image/jpeg")
     - `title`: A short description of what the image shows
5. Return the ticket identifier and URL to the user.
