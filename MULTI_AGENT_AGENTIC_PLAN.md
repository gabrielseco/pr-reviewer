# Multi-Agent Agentic Review Plan

**Date:** 2026-01-18
**Status:** Planning
**Goal:** Combine specialized agents with agentic tool use for maximum accuracy

---

## Table of Contents

1. [Overview](#overview)
2. [Key Difference from MULTI_AGENT_PLAN](#key-difference-from-multi_agent_plan)
3. [Architecture](#architecture)
4. [Tool-Enabled Agents](#tool-enabled-agents)
5. [Implementation Plan](#implementation-plan)
6. [Usage Examples](#usage-examples)
7. [Cost & Performance Analysis](#cost--performance-analysis)
8. [Comparison Matrix](#comparison-matrix)

---

## Overview

### What This Is

This plan extends the multi-agent approach by giving each specialized agent **access to tools** for codebase exploration. Instead of single-pass reviews, agents can:

- **Explore the codebase** using existing tools (read_file, search_code, etc.)
- **Verify assumptions** before flagging issues
- **Increase confidence** through multi-turn reasoning
- **Reduce false positives** by understanding context

### Existing Infrastructure

The project already has a complete agentic review system in `src/agentic/`:

- **agentic-reviewer.ts** - Multi-turn review orchestration
- **tools.ts** - 5 tool definitions:
  - `read_file` - Read full file contents
  - `search_code` - Search patterns across codebase
  - `get_git_history` - View commit history
  - `find_symbol_definition` - Locate symbol definitions
  - `find_usages` - Find all usages of a symbol
- **tool-executor.ts** - Secure tool execution with validation

### The Opportunity

We can leverage this infrastructure to create **tool-enabled specialized agents** that:

1. Focus on specific concerns (security, logic, performance, style)
2. Use tools to verify issues before reporting
3. Run in parallel for fast execution
4. Provide high-confidence reviews with lower false positive rates

---

## Key Difference from MULTI_AGENT_PLAN

| Feature | MULTI_AGENT_PLAN | MULTI_AGENT_AGENTIC_PLAN |
|---------|------------------|--------------------------|
| **Agent Specialization** | ✅ Yes (4 agents) | ✅ Yes (4 agents) |
| **Tool Access** | ❌ No tools | ✅ Full tool access |
| **Review Type** | Single-pass | Multi-turn exploration |
| **Execution Time** | Fast (5-10s) | Slower (15-60s) |
| **Cost per Review** | $0.05-$0.25 | $0.20-$1.00 |
| **False Positive Rate** | Lower (specialized) | Lowest (verified) |
| **Confidence** | Medium-High | Very High |
| **Use Case** | Quick reviews | Critical PRs |

**When to Use Which:**

- **MULTI_AGENT_PLAN** (no tools): Fast daily reviews, PR triage, routine changes
- **MULTI_AGENT_AGENTIC_PLAN** (with tools): Security-critical PRs, complex changes, production releases

---

## Architecture

### Agent Interface Extension

Extend the existing `ReviewAgent` interface to support tool use:

```typescript
// src/agents/base-agentic-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_TOOLS } from "../agentic/tools.js";
import { ToolExecutor } from "../agentic/tool-executor.js";

export interface AgenticReviewAgent {
  name: string;
  model: ModelName;
  focus: string;
  maxTurns: number; // Max tool-use turns
  review(
    prInfo: PRInfo,
    context: string,
    repoPath: string
  ): Promise<AgenticAgentReview>;
}

export interface AgenticAgentReview {
  agentName: string;
  issues: Issue[];
  summary: string;
  turnCount: number; // Actual turns used
  toolUsage: ToolUsageStats[];
  explorationLog: string[]; // What the agent explored
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

export interface ToolUsageStats {
  toolName: string;
  callCount: number;
  totalTimeMs: number;
}
```

### Base Agentic Agent Class

```typescript
// src/agents/base-agentic-agent.ts
export abstract class BaseAgenticAgent implements AgenticReviewAgent {
  abstract name: string;
  abstract model: ModelName;
  abstract focus: string;
  abstract maxTurns: number;

  constructor(protected anthropic: Anthropic) {}

  async review(
    prInfo: PRInfo,
    context: string,
    repoPath: string
  ): Promise<AgenticAgentReview> {
    const toolExecutor = new ToolExecutor(repoPath);
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: this.buildPrompt(prInfo, context),
      },
    ];

    let turnCount = 0;
    const toolUsageMap = new Map<string, ToolUsageStats>();
    const explorationLog: string[] = [];

    while (turnCount < this.maxTurns) {
      turnCount++;

      const response = await this.anthropic.messages.create({
        model: MODELS[this.model].id,
        max_tokens: MODELS[this.model].maxTokens,
        tools: REVIEW_TOOLS,
        messages,
        ...(MODELS[this.model].thinking && {
          thinking: {
            type: "enabled",
            budget_tokens: MODELS[this.model].thinking.budgetTokens,
          },
        }),
      });

      messages.push({
        role: "assistant",
        content: response.content,
      });

      if (response.stop_reason === "end_turn") {
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolName = block.name;
            const toolInput = block.input;

            // Log exploration
            explorationLog.push(
              `Turn ${turnCount}: ${toolName}(${JSON.stringify(toolInput)})`
            );

            // Execute tool
            const executionResult = await toolExecutor.executeTool(
              toolName,
              toolInput
            );

            // Track stats
            const stats = toolUsageMap.get(toolName) || {
              toolName,
              callCount: 0,
              totalTimeMs: 0,
            };
            stats.callCount++;
            stats.totalTimeMs += executionResult.executionTimeMs;
            toolUsageMap.set(toolName, stats);

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: executionResult.success
                ? executionResult.result || "Success"
                : `Error: ${executionResult.error}`,
              is_error: !executionResult.success,
            });
          }
        }

        if (toolResults.length > 0) {
          messages.push({
            role: "user",
            content: toolResults,
          });
        }
      }
    }

    // Extract review text
    const lastMessage = messages[messages.length - 1];
    let reviewText = "";
    if (lastMessage.role === "assistant") {
      if (Array.isArray(lastMessage.content)) {
        for (const block of lastMessage.content) {
          if (block.type === "text") {
            reviewText += block.text;
          }
        }
      } else {
        reviewText = lastMessage.content;
      }
    }

    const issues = this.parseIssues(reviewText);
    const usage = this.calculateUsage(messages);

    return {
      agentName: this.name,
      issues,
      summary: this.extractSummary(reviewText),
      turnCount,
      toolUsage: Array.from(toolUsageMap.values()),
      explorationLog,
      usage,
    };
  }

  protected abstract buildPrompt(prInfo: PRInfo, context: string): string;

  protected parseIssues(reviewText: string): Issue[] {
    // Same as base-agent.ts
    const issues: Issue[] = [];
    const issuePattern = /\[CONFIDENCE:\s*(\d+)\]\s*(?:Line\s+(\d+):?)?\s*(.+?)(?=\[CONFIDENCE:|$)/gs;

    let match;
    while ((match = issuePattern.exec(reviewText)) !== null) {
      const confidence = parseInt(match[1]);
      const line = match[2] ? parseInt(match[2]) : undefined;
      const message = match[3].trim();

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

  protected calculateUsage(messages: Anthropic.MessageParam[]): {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  } {
    // Estimate token usage from messages
    // In practice, you'd track this from API responses
    return {
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
    };
  }
}
```

---

## Tool-Enabled Agents

### Security Agent (Agentic)

```typescript
// src/agents/agentic-security-agent.ts
import { BaseAgenticAgent } from "./base-agentic-agent.js";

export class AgenticSecurityAgent extends BaseAgenticAgent {
  name = "Security (Agentic)";
  model = "opus" as const;
  focus = "Security vulnerabilities with codebase exploration";
  maxTurns = 10; // Allow deep exploration for security

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **security expert** with access to codebase exploration tools.

## Your Mission

Review ONLY for security vulnerabilities. DO NOT comment on style, performance, or general bugs.

## Focus Areas

- **Injection attacks**: SQL injection, XSS, command injection, LDAP injection
- **Authentication/Authorization**: Broken auth, privilege escalation, session issues
- **Sensitive data**: Hardcoded secrets, data exposure, inadequate encryption
- **Security misconfigurations**: CORS, CSP, insecure defaults
- **Dependencies**: Known vulnerable packages
- **Cryptography**: Weak algorithms, poor key management
- **Input validation**: Insufficient validation, type confusion

## Available Tools

You have access to these tools to **verify potential issues**:

- **read_file**: Read full file contents to understand implementation details
- **search_code**: Search for patterns (e.g., find all SQL queries, auth checks)
- **get_git_history**: Understand why security-sensitive code was added
- **find_symbol_definition**: Locate security-related functions/classes
- **find_usages**: Check how security-sensitive functions are used

## How to Use Tools

**IMPORTANT**: Before flagging a security issue, use tools to verify:

1. **Check context**: Read surrounding code to understand if it's actually vulnerable
2. **Find usages**: See how a function is called across the codebase
3. **Search patterns**: Look for similar code to check consistency
4. **Verify assumptions**: Don't assume - explore and confirm

**Example workflow:**
1. See potential SQL injection in diff
2. Use \`read_file\` to see full function context
3. Use \`find_usages\` to check if input is validated elsewhere
4. Use \`search_code\` to find similar patterns in codebase
5. Only report if issue is confirmed after exploration

## Confidence Scoring

For EVERY issue you report, include a confidence score (0-100):

- **90-100**: Critical security flaw (confirmed via exploration)
- **80-89**: Likely security issue (verified with tools)
- **70-79**: Possible concern (needs human judgment)
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 95] Line 42: SQL injection vulnerability (verified via read_file + find_usages)

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

After exploring the codebase, provide your review in this format:

## Summary
[1-2 sentence summary of security posture]

## Exploration
[Brief summary of what you explored and why]

## Critical Issues
[CONFIDENCE: XX] Line YY: Description (verified via <tool>)

## Recommendations
[Security hardening suggestions based on exploration]

If NO security issues found after exploration, say so clearly.`;
  }
}
```

### Logic Agent (Agentic)

```typescript
// src/agents/agentic-logic-agent.ts
export class AgenticLogicAgent extends BaseAgenticAgent {
  name = "Logic (Agentic)";
  model = "sonnet" as const;
  focus = "Business logic errors with codebase exploration";
  maxTurns = 8;

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **logic expert** with access to codebase exploration tools.

## Your Mission

Review ONLY for business logic errors and correctness. DO NOT comment on security, style, or performance.

## Focus Areas

- **Edge cases**: Null/undefined handling, empty arrays, boundary conditions
- **State management**: Race conditions, state inconsistencies
- **Calculations**: Off-by-one errors, incorrect formulas
- **Control flow**: Unreachable code, incorrect conditionals
- **Data flow**: Type mismatches, incorrect transformations
- **Error handling**: Unhandled errors, incorrect error paths
- **Async issues**: Unhandled promises, race conditions

## Available Tools

Use tools to **verify logic assumptions**:

- **read_file**: See full function implementation
- **find_symbol_definition**: Understand types and interfaces
- **find_usages**: Check how functions are called
- **search_code**: Find similar logic patterns
- **get_git_history**: Understand intent of changes

## How to Use Tools

Before flagging a logic issue:

1. **Understand types**: Use \`find_symbol_definition\` to see type definitions
2. **Check callers**: Use \`find_usages\` to see how functions are called
3. **Read context**: Use \`read_file\` to understand surrounding logic
4. **Verify edge cases**: Search for similar patterns to check consistency

## Confidence Scoring

- **90-100**: Will cause bugs (confirmed via exploration)
- **80-89**: Likely logic error (verified with tools)
- **70-79**: Possible concern
- **Below 70**: Don't report it

**Format**: [CONFIDENCE: 85] Line 42: Null pointer possible (verified via find_symbol_definition)

## PR Information

${prInfo.title ? `**Title**: ${prInfo.title}\n` : ""}${prInfo.description ? `**Description**: ${prInfo.description}\n` : ""}

## PR Diff

\`\`\`diff
${prInfo.diff}
\`\`\`

## Output Format

## Summary
[1-2 sentence summary]

## Exploration
[What you explored to verify issues]

## Logic Issues
[CONFIDENCE: XX] Line YY: Description (verified via <tool>)

## Edge Cases to Consider
[Based on exploration]`;
  }
}
```

### Performance Agent (Agentic)

```typescript
// src/agents/agentic-performance-agent.ts
export class AgenticPerformanceAgent extends BaseAgenticAgent {
  name = "Performance (Agentic)";
  model = "sonnet" as const; // Upgrade from Haiku for tool use
  focus = "Performance issues with codebase exploration";
  maxTurns = 6;

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **performance expert** with access to codebase exploration tools.

## Your Mission

Review ONLY for performance issues.

## Focus Areas

- **N+1 queries**: Multiple database queries in loops
- **Inefficient algorithms**: O(n²) when O(n) possible
- **Memory leaks**: Unclosed connections, event listeners
- **Blocking operations**: Synchronous I/O
- **Unnecessary work**: Redundant calculations
- **Large payloads**: Missing pagination
- **Caching**: Missing cache opportunities

## Available Tools

Use tools to **verify performance issues**:

- **read_file**: See full function to understand loops/queries
- **find_usages**: Check how expensive operations are called
- **search_code**: Find similar patterns to check consistency
- **find_symbol_definition**: Understand data structures

## How to Use Tools

Before flagging a performance issue:

1. **Verify loops**: Use \`read_file\` to see full loop context
2. **Check callers**: Use \`find_usages\` to see call frequency
3. **Find patterns**: Use \`search_code\` to find similar code
4. **Understand scale**: Read related code to estimate impact

## Confidence Scoring

- **90-100**: Severe performance impact (confirmed)
- **80-89**: Noticeable issue (verified)
- **70-79**: Minor concern
- **Below 70**: Don't report

**Format**: [CONFIDENCE: 85] Line 42: N+1 query (verified via read_file)

## PR Information

${prInfo.title ? `**Title**: ${prInfo.title}\n` : ""}
\`\`\`diff
${prInfo.diff}
\`\`\`

## Output Format

## Summary
[Performance impact summary]

## Exploration
[What you verified]

## Performance Issues
[CONFIDENCE: XX] Line YY: Description (verified via <tool>)`;
  }
}
```

### Style Agent (Agentic)

```typescript
// src/agents/agentic-style-agent.ts
export class AgenticStyleAgent extends BaseAgenticAgent {
  name = "Style (Agentic)";
  model = "haiku" as const; // Keep Haiku for cost efficiency
  focus = "Code quality with pattern exploration";
  maxTurns = 5; // Limited exploration for style

  protected buildPrompt(prInfo: PRInfo, context: string): string {
    return `You are a **code quality expert** with access to codebase exploration tools.

## Your Mission

Review ONLY for code quality and patterns.

## Focus Areas

- **Naming**: Unclear names, inconsistent conventions
- **Structure**: Poor separation of concerns
- **Patterns**: Anti-patterns, inconsistency with codebase
- **Duplication**: Repeated code
- **Complexity**: Functions too long/complex
- **Documentation**: Missing docs for complex logic

## Available Tools

Use tools to **check consistency**:

- **search_code**: Find similar patterns in codebase
- **read_file**: See surrounding code context
- **find_usages**: Check naming consistency

## How to Use Tools

1. **Check patterns**: Use \`search_code\` to find similar code
2. **Verify conventions**: Search for naming patterns
3. **Read context**: Understand if style fits the file

## Confidence Scoring

- **80-89**: Clear violation of project patterns
- **70-79**: Minor code smell
- **Below 70**: Don't report

**IMPORTANT**: Be conservative. Most style issues should be 70-80 confidence.

## PR Information

\`\`\`diff
${prInfo.diff}
\`\`\`

## Output Format

## Summary
[Code quality summary]

## Code Quality Issues
[CONFIDENCE: XX] Line YY: Description`;
  }
}
```

---

## Implementation Plan

### Phase 1: Base Agentic Agent Framework (Week 1)

- [ ] Create `src/agents/base-agentic-agent.ts`
  - [ ] `AgenticReviewAgent` interface
  - [ ] `AgenticAgentReview` interface
  - [ ] `BaseAgenticAgent` abstract class with tool orchestration
  - [ ] Integration with existing `ToolExecutor`
  - [ ] Exploration logging
  - [ ] Token/cost tracking
- [ ] Write unit tests for base agentic agent

### Phase 2: Specialized Agentic Agents (Week 1-2)

- [ ] Implement `AgenticSecurityAgent`
  - [ ] Enhanced prompt with tool guidance
  - [ ] Test with security-vulnerable PRs
  - [ ] Verify tool usage reduces false positives
- [ ] Implement `AgenticLogicAgent`
  - [ ] Enhanced prompt with tool guidance
  - [ ] Test with buggy logic PRs
- [ ] Implement `AgenticPerformanceAgent`
  - [ ] Enhanced prompt with tool guidance
  - [ ] Test with inefficient code PRs
- [ ] Implement `AgenticStyleAgent`
  - [ ] Enhanced prompt with tool guidance
  - [ ] Test with messy code PRs
- [ ] Integration tests for each agent

### Phase 3: Multi-Agent Agentic Orchestrator (Week 2)

- [ ] Create `src/multi-agent-agentic-reviewer.ts`
  - [ ] Parallel execution of agentic agents
  - [ ] Issue aggregation across agents
  - [ ] Deduplication with exploration context
  - [ ] Summary generation including tool usage stats
  - [ ] Total cost/time tracking
- [ ] Add exploration visibility in output
- [ ] Write integration tests

### Phase 4: CLI Integration (Week 2)

- [ ] Add `--agentic-multi-agent` flag
- [ ] Add `--max-turns <n>` flag per agent
- [ ] Add progress indicators showing tool usage
- [ ] Format output to show exploration logs
- [ ] Update help text

### Phase 5: Testing & Documentation (Week 3)

- [ ] E2E tests comparing:
  - Multi-agent (no tools) vs Agentic multi-agent
  - False positive rates
  - Detection accuracy
- [ ] Performance benchmarks
- [ ] Cost analysis
- [ ] Document when to use each approach
- [ ] Add configuration examples

---

## Usage Examples

### Basic Agentic Multi-Agent Review

```bash
# Review with all agentic agents (with tools)
pr-review https://github.com/owner/repo/pull/123 --agentic-multi-agent

# Review with specific agentic agents
pr-review 123 --repo owner/repo --agentic-multi-agent --agents security,logic

# Control exploration depth
pr-review 123 --agentic-multi-agent --max-turns 5
```

### Expected Output

```
🤖 Running agentic multi-agent review with tool access...

🔍 SecurityAgent (Agentic)
  Turn 1: read_file(path: "src/auth.ts")
  Turn 2: find_usages(symbol: "validateUser")
  Turn 3: search_code(pattern: "SQL.*query")
  ✓ Completed in 18.3s - 2 issues found (3 tools used)

🔍 LogicAgent (Agentic)
  Turn 1: find_symbol_definition(symbol: "User", type: "interface")
  Turn 2: read_file(path: "src/types.ts")
  ✓ Completed in 12.7s - 1 issue found (2 tools used)

🔍 PerformanceAgent (Agentic)
  Turn 1: read_file(path: "src/db/users.ts")
  Turn 2: search_code(pattern: "\.map.*\.filter")
  ✓ Completed in 9.2s - 1 issue found (2 tools used)

🔍 StyleAgent (Agentic)
  Turn 1: search_code(pattern: "function.*Handler")
  ✓ Completed in 5.1s - 0 issues found (1 tool used)

Aggregating results...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Multi-Agent Agentic Code Review

**Agents**: Security (Agentic), Logic (Agentic), Performance (Agentic), Style (Agentic)
**Total Issues**: 4 (2 critical, 1 high, 1 medium)
**Total Tool Calls**: 8 across 4 agents
**Exploration Time**: 45.3s

## Security Agent (Agentic)

**Exploration**: Read auth.ts, searched for SQL queries, checked validateUser usages

2 issue(s)

[CONFIDENCE: 95] Line 42: SQL injection vulnerability
  Description: User input concatenated directly into SQL query
  Verified via: read_file(auth.ts) + search_code(SQL patterns)
  Recommendation: Use parameterized queries

[CONFIDENCE: 88] Line 108: JWT secret hardcoded
  Description: Secret key found in source code
  Verified via: read_file(auth.ts)
  Recommendation: Move to environment variable

## Logic Agent (Agentic)

**Exploration**: Checked User interface definition, read types.ts

1 issue(s)

[CONFIDENCE: 90] Line 156: Null pointer possible
  Description: user can be undefined if email not found (User interface allows undefined)
  Verified via: find_symbol_definition(User) + read_file(types.ts)
  Recommendation: Add null check before accessing user.password

## Performance Agent (Agentic)

**Exploration**: Read db/users.ts, searched for inefficient patterns

1 issue(s)

[CONFIDENCE: 82] Line 203: N+1 query detected
  Description: Loop makes separate query for each user role
  Verified via: read_file(db/users.ts) - confirmed loop with 10 iterations
  Recommendation: Use JOIN or batch query

## Style Agent (Agentic)

**Exploration**: Searched for handler naming patterns

No issues found. Code follows consistent patterns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cost: $0.47
Time: 45.3s
Tool Calls: 8
```

---

## Cost & Performance Analysis

### Per Agent Costs (Medium PR ~300 lines, with tool use)

| Agent | Model | Base Tokens | Tool Calls | Total Cost | Time |
|-------|-------|-------------|------------|------------|------|
| SecurityAgent (Agentic) | Opus | ~3,500 | 3-5 | $0.18 | 15-20s |
| LogicAgent (Agentic) | Sonnet | ~3,000 | 2-4 | $0.08 | 10-15s |
| PerformanceAgent (Agentic) | Sonnet | ~2,800 | 2-3 | $0.07 | 8-12s |
| StyleAgent (Agentic) | Haiku | ~2,500 | 1-2 | $0.02 | 5-8s |
| **Total** | Mixed | | **8-14** | **$0.35-$0.60** | **38-55s** |

### Comparison: No Tools vs With Tools

| Metric | Multi-Agent (No Tools) | Multi-Agent Agentic (With Tools) |
|--------|------------------------|----------------------------------|
| **Execution** | Single-pass | Multi-turn (3-10 turns) |
| **Time** | 5-10s (parallel) | 30-60s (parallel) |
| **Cost** | $0.05-$0.25 | $0.30-$0.80 |
| **False Positives** | 10-20% | 5-10% |
| **Confidence** | 75-85% avg | 85-95% avg |
| **Verified Issues** | ❌ No | ✅ Yes (via tools) |
| **Exploration** | ❌ No | ✅ Full codebase |
| **Best For** | Daily reviews | Critical PRs |

---

## Comparison Matrix

### When to Use Each Approach

| Scenario | Recommended Approach | Reasoning |
|----------|---------------------|-----------|
| **Daily PR reviews** | Multi-Agent (No Tools) | Fast, cost-effective |
| **Security-critical PRs** | Multi-Agent Agentic | Need verified security review |
| **Pre-production releases** | Multi-Agent Agentic | Worth extra cost for confidence |
| **Simple bug fixes** | Single Agent (No Tools) | Overkill for simple changes |
| **Complex refactors** | Multi-Agent Agentic | Need context exploration |
| **Style/formatting PRs** | Single Agent (No Tools) | Tools won't help much |
| **Database migrations** | Multi-Agent Agentic | Need to verify impact |
| **CI/CD automation** | Multi-Agent (No Tools) | Need fast feedback |
| **Manual deep review** | Multi-Agent Agentic | Maximum accuracy |

### Cost vs Accuracy Trade-off

```
High Accuracy ▲
              │
              │  ◆ Multi-Agent Agentic (Tools)
              │
              │     ◆ Multi-Agent (No Tools)
              │
              │        ◆ Single Agent Agentic
              │
              │           ◆ Single Agent
              │
Low Accuracy  └────────────────────────────────► High Cost
             Low Cost
```

---

## Next Steps

1. ✅ Review this plan
2. ⬜ Decide if we want both approaches (with/without tools)
3. ⬜ Create base agentic agent class
4. ⬜ Implement AgenticSecurityAgent first
5. ⬜ Test and compare false positive rates
6. ⬜ Measure cost/time differences
7. ⬜ Document decision criteria for users
8. ⬜ Ship both options! 🚀

---

## Questions for Discussion

1. **Should we build both?** Or focus on one approach?
2. **Auto-detection?** Should we automatically use agentic agents for security-sensitive files?
3. **Hybrid mode?** Use tools only when confidence is low?
4. **Tool limits?** Should we limit tool calls to control costs?
5. **User control?** Let users choose per-agent which ones use tools?

Example hybrid config:

```json
{
  "multiAgent": {
    "agents": [
      {
        "name": "security",
        "agentic": true,  // Use tools
        "maxTurns": 10
      },
      {
        "name": "logic",
        "agentic": true,
        "maxTurns": 8
      },
      {
        "name": "performance",
        "agentic": false  // No tools (faster)
      },
      {
        "name": "style",
        "agentic": false  // No tools
      }
    ]
  }
}
```
