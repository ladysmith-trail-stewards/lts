# Post-Commit Workflow: Agent-LLM Commit Analysis

After you commit changes to a feature branch, you can ask **Agent-LLM** to analyze and document the commits.

## Usage

1. **Commit your changes** (pre-commit hook enforces format/lint):
   ```bash
   git commit -m "Add user profile form (#5)"
   ```

2. **Ask the Agent to analyze commits** in VS Code Copilot Chat:
   ```
   @Agent-LLM Analyze the commits on this branch and generate a commit doc.
   ```

   Or with a specific count:
   ```
   @Agent-LLM Analyze the last 5 commits and generate a commit doc.
   ```

3. **The agent will**:
   - Extract recent commits from `git log`
   - Parse commit messages and extract task references (e.g., #5, closes #12)
   - Generate a markdown table summarizing commits + tasks
   - Write to `docs/<branch>-commits.md`
   - Show you the file path

## What the agent extracts

- **Commit ID**: First 6 characters of the hash
- **Message**: First 60 characters of the commit message
- **Tasks**: References like `#5`, `closes #12`, `refs #8` extracted from the message

## Example output

```markdown
# Commit summary for my-feature-branch

| Commit | Message (first 60) | Tasks |
|--------|-------------------|-------|
| abc123 | Add user profile form with validation | #5 ; closes #12 |
| def456 | Update ProfileForm component styles | #5 |
| ghi789 | Add E2E tests for profile update | #5 |
```

## Integration with PRs

After generating the commit doc, you can reference it in your PR description:
- Check `docs/<branch>-commits.md` to see all commits and linked tasks
- Use the commit table in your PR body to explain the work
- Reference the doc in comments: "See docs/my-branch-commits.md for details"

## Notes

- The **pre-commit hook** enforces format/lint (runs `pnpm format && pnpm lint`)
- The **post-commit hook** is reserved (currently a no-op; commit analysis is manual via Agent-LLM)
- Task extraction looks for GitHub issue references in commit messages
- If the agent can't find references, it will still generate the table with empty "Tasks" column

---

For more info, see `.github/chatmodes/Agent-LLM.chatmode.md`.
