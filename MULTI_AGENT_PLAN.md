# Multi-Agent Parallel Review Implementation Plan

**Date:** 2026-01-18
**Status:** Planning
**Goal:** Add specialized agent review mode WITHOUT requiring agentic tool use

---

## Table of Contents

1. [Overview](#overview)
2. [Key Insight](#key-insight)
3. [Architecture](#architecture)
4. [Implementation Plan](#implementation-plan)
5. [Usage Examples](#usage-examples)
6. [Cost Analysis](#cost-analysis)
7. [Testing Strategy](#testing-strategy)

---

## Overview

### What This Is

Multi-Agent Parallel Review runs **multiple specialized agents in parallel**, each focused on a specific concern:

- **SecurityAgent** - Security vulnerabilities only
- **LogicAgent** - Business logic bugs only
- **PerformanceAgent** - Performance issues only
- **StyleAgent** - Code quality and patterns only

Each agent reviews the **same diff** but with a **highly focused prompt** that reduces false positives through specialization.

### What This Is NOT

This is **independent of** the agentic tool use feature:
- ❌ No codebase exploration (read_file, search_code, etc.)
- ❌ No multi-turn reasoning
- ❌ No dynamic context retrieval

Each agent does a **single-pass review** with a specialized lens.

### Why This Matters

1. **Better coverage** - Multiple perspectives find different issues
2. **Fewer false positives** - Narrow focus = less noise
3. **Flexible cost control** - Mix models (Opus for security, Haiku for style)
4. **Fast execution** - All agents run in parallel (5-10 seconds total)
5. **No complexity** - No tool execution, no safety concerns

---

## Key Insight

**Specialization reduces hallucinations.** When an agent is told:

> "You are a security expert. ONLY flag security issues. DO NOT comment on style, performance, or general bugs."

...it produces fewer false positives than a general-purpose reviewer trying to catch everything.

### Industry Validation

From the main improvement plan:
- Anthropic recommends 4+ specialized agents with confidence scoring
- Cursor's Bugbot uses specialized analysis passes
- Commercial tools (Snyk, SonarQube) use domain-specific engines

---

## Architecture

### Agent Interface

```typescript
// src/agents/base-agent.ts
export interface ReviewAgent {
  name: string;
  model: ModelName;
  focus: string;
  review(prInfo: PRInfo, context: string): Promise<AgentReview>;
}

export interface AgentReview {
  agentName: string;
  issues: Issue[];
  summary: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

export interface Issue {
  confidence: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: number;
  file?: string;
  message: string;
  suggestion?: string;
}
```

### Base Agent Class

```typescript
// src/agents/base-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "../models.js";

export abstract class BaseAgent implements ReviewAgent {
  abstract name: string;
  abstract model: ModelName;
  abstract focus: string;

  constructor(protected anthropic: Anthropic) {}

  async review(prInfo: PRInfo, context: string): Promise<AgentReview> {
    const prompt = this.buildPrompt(prInfo, context);
    const modelConfig = MODELS[this.model];

    const response = await this.anthropic.messages.create({
      model: modelConfig.id,
      max_tokens: modelConfig.maxTokens,
      ...(modelConfig.thinking && {
        thinking: {
          type: "enabled",
          budget_tokens: modelConfig.thinking.budgetTokens,
        },
      }),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const reviewText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const issues = this.parseIssues(reviewText);

    return {
      agentName: this.name,
      issues,
      summary: this.extractSummary(reviewText),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cost: this.calculateCost(response.usage),
      },
    };
  }

  protected abstract buildPrompt(prInfo: PRInfo, context: string): string;

  protected parseIssues(reviewText: string): Issue[] {
    const issues: Issue[] = [];
    const issuePattern = /\[CONFIDENCE:\s*(\d+)\]\s*(?:Line\s+(\d+):?)?\s*(.+?)(?=\[CONFIDENCE:|$)/gs;

    let match;
    while ((match = issuePattern.exec(reviewText)) !== null) {
      const confidence = parseInt(match[1]);
      const line = match[2] ? parseInt(match[2]) : undefined;
      const message = match[3].trim();

      // Determine severity based on confidence
      let severity: Issue["severity"];
      if (confidence >= 90) severity = "critical";
      else if (confidence >= 80) severity = "high";
      else if (confidence >= 70) severity = "medium";
      else severity = "low";

      issues.push({
        confidence,
        severity,
        line,
        message,
      });
    }

    return issues;
  }

  protected extractSummary(reviewText: string): string {
    const summaryMatch = reviewText.match(/## Summary\s*\n(.+?)(?=\n##|$)/s);
    return summaryMatch ? summaryMatch[1].trim() : "No summary provided";
  }

  protected calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
    const modelConfig = MODELS[this.model];
    const inputCost = (usage.input_tokens / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * modelConfig.pricing.output;
    return inputCost + outputCost;
  }
}
```

### Specialized Agent Implementations

#### SecurityAgent

```typescript
// src/agents/security-agent.ts
import { BaseAgent } from "./base-agent.js";

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
**Files Changed**: ${prInfo.changedFiles?.length || 0}

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
```

#### LogicAgent

```typescript
// src/agents/logic-agent.ts
import { BaseAgent } from "./base-agent.js";

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
**Files Changed**: ${prInfo.changedFiles?.length || 0}

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
```

#### PerformanceAgent

```typescript
// src/agents/performance-agent.ts
import { BaseAgent } from "./base-agent.js";

export class PerformanceAgent extends BaseAgent {
  name = "Performance";
  model = "haiku" as const;
  focus = "Performance issues, N+1 queries, memory leaks";

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **performance expert** performing a focused performance review.

## Your Mission
Review ONLY for performance issues. DO NOT comment on:
- Security issues
- Code style or formatting
- General bugs
- Best practices (unless they affect performance)

## Focus Areas
- **N+1 queries**: Multiple database queries in loops
- **Inefficient algorithms**: O(n²) when O(n) possible, unnecessary iterations
- **Memory leaks**: Unclosed connections, event listeners, references
- **Blocking operations**: Synchronous I/O, long-running operations on main thread
- **Unnecessary work**: Redundant calculations, excessive re-renders
- **Large payloads**: Fetching too much data, missing pagination
- **Caching**: Missing cache opportunities, cache invalidation issues
- **Resource management**: File handles, connections not closed

## Confidence Scoring
For EVERY issue you report, include a confidence score (0-100):

- **90-100**: Severe performance impact (will slow down significantly)
- **80-89**: Noticeable performance issue worth addressing
- **70-79**: Minor performance concern
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 85] Line 42: N+1 query in user list endpoint

**ONLY report issues with confidence ≥ 70.**

## PR Information
${prInfo.title ? `**Title**: ${prInfo.title}\n` : ""}${prInfo.description ? `**Description**: ${prInfo.description}\n` : ""}
**Files Changed**: ${prInfo.changedFiles?.length || 0}

## Additional Context
${context || "No additional context provided"}

## PR Diff
\`\`\`diff
${prInfo.diff}
\`\`\`

## Output Format
Provide your review in this format:

## Summary
[1-2 sentence summary of performance impact]

## Performance Issues
[CONFIDENCE: XX] Line YY: Description
[CONFIDENCE: XX] Line YY: Description

## Optimization Suggestions
[Any performance optimization ideas]

If NO performance issues found, say so clearly.`;
  }
}
```

#### StyleAgent

```typescript
// src/agents/style-agent.ts
import { BaseAgent } from "./base-agent.js";

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
**Files Changed**: ${prInfo.changedFiles?.length || 0}

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
```

### Multi-Agent Orchestrator

```typescript
// src/multi-agent-reviewer.ts
import Anthropic from "@anthropic-ai/sdk";
import { SecurityAgent } from "./agents/security-agent.js";
import { LogicAgent } from "./agents/logic-agent.js";
import { PerformanceAgent } from "./agents/performance-agent.js";
import { StyleAgent } from "./agents/style-agent.js";
import type { ReviewAgent, AgentReview, Issue } from "./agents/base-agent.js";

export interface MultiAgentReviewResult {
  issues: Issue[];
  agentReviews: AgentReview[];
  summary: string;
  totalCost: number;
  timing: {
    total: number;
    perAgent: Record<string, number>;
  };
}

export interface MultiAgentOptions {
  agents?: string[]; // ["security", "logic", "performance", "style"]
  minConfidence?: number; // Default: 70
  parallelExecution?: boolean; // Default: true
}

export async function multiAgentReview(
  prInfo: PRInfo,
  context: string,
  anthropic: Anthropic,
  options: MultiAgentOptions = {}
): Promise<MultiAgentReviewResult> {
  const {
    agents: requestedAgents = ["security", "logic", "performance", "style"],
    minConfidence = 70,
    parallelExecution = true,
  } = options;

  // Initialize requested agents
  const allAgents: Record<string, ReviewAgent> = {
    security: new SecurityAgent(anthropic),
    logic: new LogicAgent(anthropic),
    performance: new PerformanceAgent(anthropic),
    style: new StyleAgent(anthropic),
  };

  const activeAgents = requestedAgents
    .map((name) => allAgents[name])
    .filter((agent) => agent !== undefined);

  if (activeAgents.length === 0) {
    throw new Error("No valid agents specified");
  }

  const startTime = Date.now();
  const perAgentTiming: Record<string, number> = {};

  // Run agents in parallel or sequentially
  let reviews: AgentReview[];
  if (parallelExecution) {
    reviews = await Promise.all(
      activeAgents.map(async (agent) => {
        const agentStart = Date.now();
        const review = await agent.review(prInfo, context);
        perAgentTiming[agent.name] = Date.now() - agentStart;
        return review;
      })
    );
  } else {
    reviews = [];
    for (const agent of activeAgents) {
      const agentStart = Date.now();
      const review = await agent.review(prInfo, context);
      perAgentTiming[agent.name] = Date.now() - agentStart;
      reviews.push(review);
    }
  }

  // Aggregate issues
  const allIssues = reviews.flatMap((r) => r.issues);

  // Filter by confidence
  const filteredIssues = allIssues.filter(
    (issue) => issue.confidence >= minConfidence
  );

  // Deduplicate similar issues
  const uniqueIssues = deduplicateIssues(filteredIssues);

  // Sort by confidence (highest first)
  uniqueIssues.sort((a, b) => b.confidence - a.confidence);

  // Calculate total cost
  const totalCost = reviews.reduce((sum, r) => sum + r.usage.cost, 0);

  // Build summary
  const summary = buildAggregatedSummary(reviews, uniqueIssues);

  return {
    issues: uniqueIssues,
    agentReviews: reviews,
    summary,
    totalCost,
    timing: {
      total: Date.now() - startTime,
      perAgent: perAgentTiming,
    },
  };
}

function deduplicateIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const unique: Issue[] = [];

  for (const issue of issues) {
    // Create a key based on line and similarity of message
    const key = `${issue.line || "global"}:${normalizeMessage(issue.message)}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  return unique;
}

function normalizeMessage(message: string): string {
  // Remove common variations to detect duplicates
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

function buildAggregatedSummary(
  reviews: AgentReview[],
  issues: Issue[]
): string {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;

  let summary = `# Multi-Agent Code Review\n\n`;
  summary += `**Agents**: ${reviews.map((r) => r.agentName).join(", ")}\n`;
  summary += `**Total Issues**: ${issues.length}`;

  if (criticalCount > 0) summary += ` (${criticalCount} critical`;
  if (highCount > 0) summary += `, ${highCount} high`;
  if (mediumCount > 0) summary += `, ${mediumCount} medium`;
  if (criticalCount > 0 || highCount > 0 || mediumCount > 0) summary += `)`;

  summary += `\n\n`;

  for (const review of reviews) {
    const agentIssues = issues.filter((i) =>
      review.issues.some((ri) => ri.message === i.message)
    );
    summary += `## ${review.agentName} Agent\n`;
    if (agentIssues.length === 0) {
      summary += `No issues found.\n\n`;
    } else {
      summary += `${agentIssues.length} issue(s)\n\n`;
    }
  }

  return summary;
}
```

---

## Implementation Plan

### Phase 1: Core Agent Framework (Week 1)
**Effort**: 2-3 days

- [ ] Create `src/agents/` directory
- [ ] Implement `base-agent.ts` with:
  - [ ] `ReviewAgent` interface
  - [ ] `AgentReview` interface
  - [ ] `Issue` interface
  - [ ] `BaseAgent` abstract class
  - [ ] Issue parsing logic
  - [ ] Cost calculation
- [ ] Add model configuration for Opus (if not already present)
- [ ] Write unit tests for base agent

### Phase 2: Specialized Agents (Week 1-2)
**Effort**: 3-4 days

- [ ] Implement `SecurityAgent`
  - [ ] Focused security prompt
  - [ ] Test with sample security-vulnerable PR
- [ ] Implement `LogicAgent`
  - [ ] Focused logic prompt
  - [ ] Test with sample buggy logic PR
- [ ] Implement `PerformanceAgent`
  - [ ] Focused performance prompt
  - [ ] Test with sample inefficient code PR
- [ ] Implement `StyleAgent`
  - [ ] Focused style prompt
  - [ ] Test with sample messy code PR
- [ ] Write integration tests for each agent

### Phase 3: Orchestrator (Week 2)
**Effort**: 2 days

- [ ] Implement `multi-agent-reviewer.ts`
  - [ ] Parallel execution
  - [ ] Issue aggregation
  - [ ] Deduplication logic
  - [ ] Summary generation
- [ ] Add timing tracking
- [ ] Add cost tracking
- [ ] Write integration tests

### Phase 4: CLI Integration (Week 2)
**Effort**: 1 day

- [ ] Add `--multi-agent` flag
- [ ] Add `--agents <list>` flag to select specific agents
- [ ] Add `--min-confidence <n>` flag
- [ ] Update help text
- [ ] Add progress indicators for parallel execution
- [ ] Format multi-agent output nicely

### Phase 5: Testing & Documentation (Week 3)
**Effort**: 2 days

- [ ] End-to-end tests with real PRs
- [ ] Performance benchmarks
- [ ] Cost analysis on various PR sizes
- [ ] Update README with multi-agent examples
- [ ] Add configuration examples
- [ ] Document agent selection strategies

---

## Usage Examples

### Basic Multi-Agent Review

```bash
# Review with all agents
pr-review https://github.com/owner/repo/pull/123 --multi-agent

# Review with specific agents
pr-review 123 --repo owner/repo --multi-agent --agents security,logic

# Adjust confidence threshold
pr-review 123 --multi-agent --min-confidence 80
```

### Expected Output

```
🤖 Running multi-agent review...

✓ SecurityAgent (3.2s) - 2 issues found
✓ LogicAgent (2.8s) - 3 issues found
✓ PerformanceAgent (1.9s) - 1 issue found
✓ StyleAgent (1.7s) - 0 issues found

Aggregating results...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Multi-Agent Code Review

**Agents**: Security, Logic, Performance, Style
**Total Issues**: 6 (2 critical, 3 high, 1 medium)

## Security Agent
2 issue(s)

[CONFIDENCE: 95] Line 42: SQL injection vulnerability
  Description: User input concatenated directly into SQL query
  Recommendation: Use parameterized queries

[CONFIDENCE: 85] Line 108: JWT secret hardcoded
  Description: Secret key stored in source code
  Recommendation: Move to environment variable

## Logic Agent
3 issue(s)

[CONFIDENCE: 90] Line 156: Null pointer possible
  Description: user can be null if email not found
  Recommendation: Add null check before accessing user.password

[CONFIDENCE: 82] Line 203: Off-by-one error in pagination
  Description: limit + offset may exceed array bounds
  Recommendation: Check array length before slicing

[CONFIDENCE: 75] Line 87: Unhandled promise rejection
  Description: Async function called without await or .catch()
  Recommendation: Add error handling

## Performance Agent
1 issue(s)

[CONFIDENCE: 78] Line 203: N+1 query detected
  Description: Loop makes separate query for each user role
  Recommendation: Use JOIN or batch query

## Style Agent
No issues found.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cost: $0.28
Time: 3.5s
```

### Programmatic Usage

```typescript
import { multiAgentReview } from "pr-reviewer";

const result = await multiAgentReview(
  prInfo,
  context,
  anthropic,
  {
    agents: ["security", "logic", "performance"],
    minConfidence: 75,
    parallelExecution: true,
  }
);

console.log(`Found ${result.issues.length} issues`);
console.log(`Cost: $${result.totalCost.toFixed(4)}`);

// Filter by severity
const criticalIssues = result.issues.filter(i => i.severity === "critical");
console.log(`Critical: ${criticalIssues.length}`);
```

---

## Cost Analysis

### Per Agent Costs (Medium PR ~300 lines)

| Agent | Model | Input Tokens | Output Tokens | Cost |
|-------|-------|--------------|---------------|------|
| SecurityAgent | Opus | ~2,500 | ~500 | $0.095 |
| LogicAgent | Sonnet | ~2,500 | ~500 | $0.015 |
| PerformanceAgent | Haiku | ~2,500 | ~400 | $0.001 |
| StyleAgent | Haiku | ~2,500 | ~400 | $0.001 |
| **Total** | Mixed | | | **$0.112** |

### Comparison to Single Agent

| Approach | Small PR | Medium PR | Large PR |
|----------|----------|-----------|----------|
| Single (Haiku) | $0.003 | $0.007 | $0.013 |
| Single (Sonnet) | $0.04 | $0.08 | $0.15 |
| Single (Opus) | $0.10 | $0.23 | $0.45 |
| **Multi-Agent (Mixed)** | **$0.05** | **$0.11** | **$0.22** |
| Multi-Agent (All Opus) | $0.38 | $0.92 | $1.80 |

### Cost Optimization Strategies

1. **Mixed models** (recommended)
   - Security: Opus (most important)
   - Logic: Sonnet (balanced)
   - Performance: Haiku (fast scan)
   - Style: Haiku (fast scan)

2. **Selective agents**
   ```bash
   # Security-critical PR: only security + logic
   pr-review 123 --multi-agent --agents security,logic

   # Performance-focused PR: only performance
   pr-review 123 --multi-agent --agents performance
   ```

3. **Auto-detection**
   - Detect security-sensitive files → add SecurityAgent
   - Detect database changes → add PerformanceAgent
   - Always run SecurityAgent + LogicAgent at minimum

---

## Testing Strategy

### Unit Tests

```typescript
// src/agents/security-agent.test.ts
import { test, expect } from "bun:test";
import { SecurityAgent } from "./security-agent.js";

test("SecurityAgent detects SQL injection", async () => {
  const agent = new SecurityAgent(mockAnthropic);

  const prInfo = {
    diff: `
+const query = "SELECT * FROM users WHERE id = " + userId;
+db.execute(query);
    `,
    title: "Add user lookup",
  };

  const review = await agent.review(prInfo, "");

  expect(review.issues.length).toBeGreaterThan(0);
  expect(review.issues[0].message).toContain("SQL injection");
  expect(review.issues[0].confidence).toBeGreaterThanOrEqual(70);
});

test("SecurityAgent ignores style issues", async () => {
  const agent = new SecurityAgent(mockAnthropic);

  const prInfo = {
    diff: `
+function getUserName(user) {
+  return user.name; // Bad naming, but not a security issue
+}
    `,
  };

  const review = await agent.review(prInfo, "");

  // Should not flag style issues
  expect(review.issues.length).toBe(0);
});
```

### Integration Tests

```typescript
// src/multi-agent-reviewer.test.ts
import { test, expect } from "bun:test";
import { multiAgentReview } from "./multi-agent-reviewer.js";

test("Multi-agent review aggregates issues correctly", async () => {
  const result = await multiAgentReview(
    samplePR,
    "",
    anthropic,
    {
      agents: ["security", "logic"],
      minConfidence: 70,
    }
  );

  expect(result.agentReviews.length).toBe(2);
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.totalCost).toBeGreaterThan(0);
});

test("Deduplication removes similar issues", async () => {
  // Test that if two agents flag the same line,
  // it only appears once in the final result
});

test("Confidence filtering works", async () => {
  const result = await multiAgentReview(
    samplePR,
    "",
    anthropic,
    { minConfidence: 80 }
  );

  result.issues.forEach(issue => {
    expect(issue.confidence).toBeGreaterThanOrEqual(80);
  });
});
```

### E2E Tests

```bash
# Test with real PRs
bun test:e2e

# Test cost tracking
bun run src/cli.ts <test-PR> --multi-agent --verbose

# Test specific agents
bun run src/cli.ts <test-PR> --multi-agent --agents security
```

---

## Configuration

### Config File Support

```json
// .pr-reviewer.config.json
{
  "multiAgent": {
    "enabled": true,
    "agents": ["security", "logic", "performance", "style"],
    "minConfidence": 75,
    "parallelExecution": true,
    "agentModels": {
      "security": "opus",
      "logic": "sonnet",
      "performance": "haiku",
      "style": "haiku"
    }
  }
}
```

### CLI Flags

```bash
Options:
  --multi-agent              Enable multi-agent review mode
  --agents <list>            Comma-separated list of agents (security,logic,performance,style)
  --min-confidence <n>       Minimum confidence threshold [default: 70]
  --sequential               Run agents sequentially instead of parallel
  --agent-model <agent>=<model>  Override model for specific agent (e.g., --agent-model security=opus)
```

---

## Success Metrics

### Quality Metrics
- **Issue Diversity**: Each agent finds different types of issues
- **False Positive Rate**: < 20% (down from ~40% single agent)
- **Coverage**: 90%+ of known bug categories detected

### Performance Metrics
- **Parallel Execution Time**: < 5s for all agents (medium PR)
- **Sequential Execution Time**: < 15s for all agents
- **Cost**: $0.05 - $0.25 per review (mixed models)

### Validation
1. Run on 20 known-vulnerable PRs (security)
2. Run on 20 known-buggy PRs (logic)
3. Run on 20 known-slow PRs (performance)
4. Measure detection rate for each category

---

## Future Enhancements

### Custom Agents
Allow users to define custom agents:

```json
{
  "customAgents": {
    "compliance": {
      "model": "opus",
      "prompt": "Review for GDPR/HIPAA compliance...",
      "focus": "Regulatory compliance"
    }
  }
}
```

### Agent Auto-Selection
Smart detection based on PR content:

```typescript
// Auto-select agents based on files changed
if (hasSecuritySensitiveFiles(pr)) {
  agents.push("security");
}
if (hasDatabaseFiles(pr)) {
  agents.push("performance");
}
if (hasNewFeature(pr)) {
  agents.push("logic", "style");
}
```

### Agent Weighting
Give more weight to certain agents:

```json
{
  "agentWeights": {
    "security": 2.0,  // Security issues are more important
    "logic": 1.5,
    "performance": 1.0,
    "style": 0.5
  }
}
```

---

## Timeline

- **Week 1**: Core framework + 2 agents (Security, Logic)
- **Week 2**: Remaining agents + Orchestrator + CLI
- **Week 3**: Testing + Documentation + Polish

**Total**: ~3 weeks to production-ready

---

## Next Steps

1. ✅ Review this plan
2. ⬜ Create `src/agents/` directory structure
3. ⬜ Implement base agent class
4. ⬜ Implement SecurityAgent (first priority)
5. ⬜ Test SecurityAgent with vulnerable PRs
6. ⬜ Implement remaining agents
7. ⬜ Build orchestrator
8. ⬜ Add CLI flags
9. ⬜ Test end-to-end
10. ⬜ Ship it! 🚀
