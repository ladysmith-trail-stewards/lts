# Post-Commit Workflow: Pre-PR Documentation

After you commit changes to a feature branch and before opening a PR, you can ask **Agent-LLM** to generate pre-PR documentation **with comprehensive code review**.

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
   - Extract branch name and recent commits
   - Parse commit messages for task/issue references (e.g., #5, closes #12)
   - **Perform detailed code review** across changed files:
     - Security/secrets detection
     - Test coverage analysis
     - Performance/bundle size warnings
     - Error handling and validation gaps
     - Auth/RLS policy enforcement
     - Best practice violations
   - Suggest a PR title based on your work
   - Confirm with you: title, description, issues, tasks
   - Auto-generate the pre-PR markdown template with findings
   - Write to `docs/<branch>-pre-pr.md`
   - Show you the file and next steps

## What the template includes

- **PR Title**: Auto-suggested based on branch work
- **PR Description**: Context and rationale
- **Linked issues**: GitHub issue references from commits
- **Tasks**: What this PR accomplishes
- **LLM Review Summary**: 
  - ✅ Strengths & security checks passed
  - ⚠️ Non-blocking observations & recommendations
  - 🔴 Blockers (if any)
- **Test steps**: Validation commands to run
- **Checklist**: Pre-merge verification items

## Integration with PRs

After generating the pre-PR doc, you'll have a file at `docs/<branch>-pre-pr.md`:
- **Review the code review findings** — address any 🔴 blockers before merge
- Make any refinements to title/description
- Copy into your GitHub PR description
- Run the suggested test steps locally before pushing
- Use the checklist as your pre-merge gate
- Share review with team during PR review

## Notes

- The **pre-commit hook** enforces format/lint (runs `pnpm format && pnpm lint`)
- Pre-PR docs help catch issues before opening the PR
- The template is a guide—adjust as needed for your specific work
- **Code review findings are NOT a gate**—they're guidance. 🔴 Blockers should be fixed first.

---

For more info, see `.github/chatmodes/Agent-LLM.chatmode.md`.
