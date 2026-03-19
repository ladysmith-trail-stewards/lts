# Post-Commit Workflow: Pre-PR Documentation

After you commit changes to a feature branch and before opening a PR, you can ask **Agent-LLM** to generate pre-PR documentation.

## Usage

1. **Commit your changes** (pre-commit hook enforces format/lint):
   ```bash
   git commit -m "Add user profile form (#5)"
   ```

2. **Ask the Agent to generate pre-PR docs** in VS Code Copilot Chat:
   ```
   @Agent-LLM Generate pre-PR documentation for this branch.
   ```

3. **The agent will**:
   - Extract branch name and recent work
   - Parse commit messages for task references (e.g., #5, closes #12)
   - Generate a structured pre-PR markdown template
   - Write to `docs/<branch>-pre-pr.md`
   - Show you the file path

## What the template includes

- **PR Title**: Auto-suggested based on branch work
- **PR Description**: Context and rationale
- **Linked issues**: GitHub issue references from commits
- **Tasks**: What this PR accomplishes
- **LLM Review Summary**: AI-generated summary of changes
- **Test steps**: Validation commands to run
- **Checklist**: Pre-merge verification items

## Integration with PRs

After generating the pre-PR doc, copy the content into your GitHub PR description:
- Review the suggested title and description
- Validate linked issues and tasks
- Run the test steps locally before pushing
- Use the checklist as your pre-merge gate

## Notes

- The **pre-commit hook** enforces format/lint (runs `pnpm format && pnpm lint`)
- Pre-PR docs help catch issues before opening the PR
- The template is a guide—adjust as needed for your specific work

---

For more info, see `.github/chatmodes/Agent-LLM.chatmode.md`.
