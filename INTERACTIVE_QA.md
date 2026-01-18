# Interactive Q&A Mode

Interactive Q&A mode allows you to ask follow-up questions about the review after it completes.

## How to Use

Add the `--interactive` (or `-i`) flag to any review command:

```bash
# Basic usage
pr-review https://github.com/owner/repo/pull/123 --interactive

# With model selection
pr-review https://github.com/owner/repo/pull/123 --model opus --interactive

# Short form
pr-review 123 --repo owner/repo -i
```

## Example Session

```bash
$ pr-review https://github.com/owner/repo/pull/123 --model opus --interactive

📝 PR: Add user authentication
📦 Repository: owner/repo
📄 Files changed: 5

================================================================================
CODE REVIEW
================================================================================

## Summary
This PR adds user authentication using JWT tokens...

[CONFIDENCE: 95] Line 42: SQL injection vulnerability in login query
[CONFIDENCE: 85] Line 108: JWT secret hardcoded in source code

================================================================================

✨ Review complete!

================================================================================
💬 INTERACTIVE Q&A MODE
================================================================================

Ask follow-up questions about the review!
Examples:
  - "Why did you flag line 42?"
  - "Can you suggest a fix for the SQL injection issue?"
  - "Are there similar patterns elsewhere I should check?"
  - "Is this really a critical issue?"

Type "exit" or "quit" to end the session.

❓ Why is the SQL injection on line 42 a critical issue?

💡 The SQL injection on line 42 is critical because the login query
concatenates user input directly into the SQL string:

`SELECT * FROM users WHERE email = '${userEmail}'`

An attacker could input: `' OR '1'='1` and bypass authentication entirely,
gaining access to any user account. This is one of the OWASP Top 10 most
critical web application security risks.

❓ Can you suggest a secure fix?

💡 Use parameterized queries instead:

```javascript
const user = await db.query(
  'SELECT * FROM users WHERE email = ?',
  [userEmail]
);
```

This ensures user input is properly escaped and treated as data, not code.
Most modern database libraries (e.g., pg, mysql2, TypeScript ORM libraries)
support parameterized queries out of the box.

❓ exit

✨ Ending interactive session. Goodbye!
```

## What You Can Ask

### Clarification Questions
- "Why did you flag line 42?"
- "What exactly is wrong with this approach?"
- "Can you explain this issue in simpler terms?"

### Solution Requests
- "Can you suggest a fix?"
- "What's the best way to handle this?"
- "Show me an example of the correct pattern"

### Code Exploration (Future)
When agentic mode is implemented, you'll also be able to ask:
- "Are there similar patterns elsewhere in the codebase?"
- "How is this pattern handled in other files?"
- "Can you find other uses of this function?"

## Current Limitations

**Simple Mode (Current Implementation):**
- ✅ Can discuss issues found in the review
- ✅ Can suggest fixes based on the diff
- ✅ Can clarify reasoning
- ❌ Cannot search the codebase for patterns
- ❌ Cannot read files outside the diff
- ❌ Cannot explore git history

**Future: Full Mode (After Agentic Review)**

Once agentic review with tools is implemented, interactive mode will be able to:
- ✅ Search the codebase during Q&A
- ✅ Read full file contents
- ✅ Find similar patterns
- ✅ Check git history

## Tips for Better Questions

1. **Be specific**: "Why is line 42 flagged?" vs "Tell me about the issues"
2. **Ask for examples**: "Show me a secure version" vs "How do I fix this?"
3. **Reference line numbers**: Claude knows the exact context
4. **Ask for reasoning**: Understanding why helps you learn

## Cost Considerations

Each follow-up question makes an additional API call:
- **Haiku**: ~$0.001 per question
- **Sonnet**: ~$0.01 per question
- **Opus**: ~$0.05 per question

The conversation history grows with each question, so later questions cost slightly more due to larger context.

## Exit Interactive Mode

Type any of these to exit:
- `exit`
- `quit`
- Press Ctrl+C
- Press Ctrl+D (EOF)

---

## Implementation Details (for developers)

The interactive mode:
1. Preserves the full conversation history (initial prompt + review response)
2. Each question adds to the history
3. Claude sees the entire conversation when answering
4. Questions are answered using the same model that performed the review
5. No thinking budget is used for Q&A (to keep costs down)

Files:
- `src/interactive-qa.ts` - Interactive Q&A implementation
- `src/reviewer.ts` - Integration with main review flow
- `src/index.ts` - CLI argument handling
