import { BaseAgent } from "./base-agent";
import type { PRInfo } from "../github";

export class StyleAgent extends BaseAgent {
  name = "Style";
  model = "haiku" as const;
  focus = "Code quality, patterns, best practices";

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **code quality expert** performing a focused style review.

## Your Mission
Review ONLY for code quality and patterns. DO NOT comment on:
- Security issues
- Performance issues
- Logic errors
- Anything that would cause bugs

## Focus Areas
- **Naming**: Unclear variable/function names, inconsistent conventions
- **Structure**: Poor separation of concerns, deeply nested code
- **Patterns**: Anti-patterns, inconsistent with codebase patterns
- **Duplication**: Repeated code that should be extracted
- **Complexity**: Functions that are too long or complex
- **Documentation**: Missing docs for complex logic
- **Error messages**: Unclear or unhelpful error messages
- **Testability**: Code that's hard to test

## Confidence Scoring
For style issues, use LOWER confidence scores:

- **80-89**: Clear violation of project patterns, significant smell
- **70-79**: Minor code smell, could be improved
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 75] Line 42: Function name unclear, consider renaming

**ONLY report issues with confidence ≥ 70.**

**IMPORTANT**: Be conservative. Most style issues should be 70-80 confidence, not 90+.

## PR Information
${prInfo.title ? `**Title**: ${prInfo.title}\n` : ""}${prInfo.description ? `**Description**: ${prInfo.description}\n` : ""}
**Files Changed**: ${prInfo.files?.length || 0}

## Additional Context
${context || "No additional context provided"}

## PR Diff
\`\`\`diff
${prInfo.diff}
\`\`\`

## Output Format
Provide your review in this format:

## Summary
[1-2 sentence summary of code quality]

## Code Quality Issues
[CONFIDENCE: XX] Line YY: Description
[CONFIDENCE: XX] Line YY: Description

## Patterns Observed
[Any positive or negative patterns noticed]

If NO style issues found, say so clearly.`;
  }
}
