import { BaseAgent } from "./base-agent";
import type { PRInfo } from "../github";

export class SecurityAgent extends BaseAgent {
  name = "Security";
  model = "opus" as const;
  focus = "Security vulnerabilities, injection attacks, authentication issues";

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **security expert** performing a focused security review.

## Your Mission
Review ONLY for security vulnerabilities. DO NOT comment on:
- Code style or formatting
- Performance issues
- General bugs (unless security-related)
- Best practices (unless security-related)

## Focus Areas
- **Injection attacks**: SQL injection, XSS, command injection, LDAP injection
- **Authentication/Authorization**: Broken auth, privilege escalation, session issues
- **Sensitive data**: Hardcoded secrets, data exposure, inadequate encryption
- **Security misconfigurations**: CORS, CSP, insecure defaults
- **Dependencies**: Known vulnerable packages
- **Cryptography**: Weak algorithms, poor key management
- **Input validation**: Insufficient validation, type confusion
- **OWASP Top 10**: Any issues from current OWASP Top 10

## Confidence Scoring
For EVERY issue you report, include a confidence score (0-100):

- **90-100**: Critical security flaw (will cause breach/exploit)
- **80-89**: Likely security issue worth addressing
- **70-79**: Possible concern, needs human judgment
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 95] Line 42: SQL injection vulnerability in user input

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
[1-2 sentence summary of security posture]

## Critical Issues
[CONFIDENCE: XX] Line YY: Description
[CONFIDENCE: XX] Line YY: Description

## Recommendations
[Any security hardening suggestions]

If NO security issues found, say so clearly.`;
  }
}
