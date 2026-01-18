import { BaseAgent } from "./base-agent";
import type { PRInfo } from "../github";

export class LogicAgent extends BaseAgent {
  name = "Logic";
  model = "sonnet" as const;
  focus = "Business logic errors, edge cases, correctness";

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **logic expert** performing a focused correctness review.

## Your Mission
Review ONLY for business logic errors and correctness. DO NOT comment on:
- Security issues (unless they stem from logic errors)
- Code style or formatting
- Performance issues
- Best practices (unless they affect correctness)

## Focus Areas
- **Edge cases**: Null/undefined handling, empty arrays, boundary conditions
- **State management**: Race conditions, state inconsistencies, invalid transitions
- **Calculations**: Off-by-one errors, incorrect formulas, precision issues
- **Control flow**: Unreachable code, incorrect conditionals, missing branches
- **Data flow**: Type mismatches, incorrect transformations, data loss
- **Error handling**: Unhandled errors, incorrect error paths
- **Async issues**: Unhandled promises, race conditions, deadlocks
- **Business rules**: Incorrect implementation of requirements

## Confidence Scoring
For EVERY issue you report, include a confidence score (0-100):

- **90-100**: Will cause bugs (incorrect logic, crashes)
- **80-89**: Likely logic error worth addressing
- **70-79**: Possible concern, needs human judgment
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 85] Line 42: Null pointer possible when user not found

**ONLY report issues with confidence ≥ 70.**

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
[1-2 sentence summary of logic correctness]

## Logic Issues
[CONFIDENCE: XX] Line YY: Description
[CONFIDENCE: XX] Line YY: Description

## Edge Cases to Consider
[Any edge cases that should be tested]

If NO logic issues found, say so clearly.`;
  }
}
