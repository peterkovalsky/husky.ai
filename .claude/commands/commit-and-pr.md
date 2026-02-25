Commit all changes on the current branch and create a pull request.

Steps:
1. Run `git status` to see all changed and untracked files. Run `git diff` to see staged and unstaged changes. Run `git log --oneline -10` to see recent commit style. Run `git log --oneline main..HEAD` to see commits on this branch.
2. Stage all relevant changed files (exclude sensitive files like .env, credentials, key files). Use specific file names rather than `git add -A`.
3. Write a concise commit message that summarizes all the changes. Follow the existing commit message style from the repo.
4. Commit the changes.
5. Push the branch to origin with `git push -u origin HEAD`.
6. Determine the base branch (usually `main`). Run `git diff main...HEAD` to understand the full scope of changes across all commits on this branch.
7. Create a pull request using `gh pr create` with:
   - A short, descriptive title (under 70 characters)
   - A body that includes:
     - `## Summary` section with 2-5 bullet points describing what changed and why
     - `## Changes` section listing key files/areas modified
     - `## Test plan` section with a checklist of how to verify the changes
8. Return the PR URL to the user.

If there are no changes to commit, check if there are already commits on this branch that aren't on main, and just create the PR from those.
