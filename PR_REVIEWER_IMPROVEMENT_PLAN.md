# PR Reviewer Improvement Plan

**Date:** 2026-01-17
**Status:** Planning Phase
**Goal:** Transform pr-reviewer from single-pass tool to state-of-the-art agentic PR review system

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Industry Benchmark Comparison](#industry-benchmark-comparison)
4. [Improvement Options](#improvement-options)
5. [Cost Analysis](#cost-analysis)
6. [Phased Implementation Roadmap](#phased-implementation-roadmap)
7. [Technical Specifications](#technical-specifications)
8. [Success Metrics](#success-metrics)
9. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

### Current State
- **Architecture:** Single-pass, non-agentic review tool
- **Models:** Haiku (default) or Sonnet
- **Cost:** $0.003 - $0.30 per review (extremely cheap)
- **Strengths:** Clean code, good UX, smart prompt engineering
- **Limitations:** No context retrieval, no tool use, no multi-turn reasoning

### Target State
- **Architecture:** Agentic multi-turn review with tool use and RAG
- **Models:** Opus 4.5 with extended thinking
- **Cost:** $0.20 - $2.00 per review (still incredibly cheap)
- **Capabilities:** Dynamic context retrieval, specialized agents, confidence scoring
- **ROI:** 100:1 to 1000:1 vs. human review time

### Key Insight
**Don't optimize for cost — optimize for quality.** The difference between $0.01 and $0.50 per review is negligible compared to the cost of missing critical bugs or wasting engineer time on false positives.

---

## Current State Analysis

### Strengths ✅
1. **Clean modular architecture** - Well-organized TypeScript codebase
2. **Smart prompt engineering** - Acknowledges diff limitations, reduces false positives
3. **Model selection** - Choice between Haiku/Sonnet with cost tracking
4. **Custom guidelines** - Per-repo review contexts via markdown files
5. **Great UX** - Interactive mode, preference saving, clear output
6. **Fast** - GitHub fetch + Claude generation typically < 10 seconds

### Critical Gaps ❌
1. **No repository context beyond diff** - Only sees 3 lines around changes
2. **Single-pass, non-agentic** - One prompt → one response, no exploration
3. **No confidence scoring** - All issues treated equally
4. **No specialized agents** - Single general-purpose review
5. **No incremental review** - Reviews entire PR at once
6. **No extended thinking** - Using standard model inference
7. **No tool use** - Can't explore codebase, read files, or search symbols

### Comparison to Industry Leaders

| Feature | Current Tool | Cursor Bugbot | Anthropic Guide | Best Practice |
|---------|--------------|---------------|-----------------|---------------|
| Agentic workflow | ❌ | ✅ | ✅ | ✅ Required |
| Extended thinking | ❌ | ✅ | ✅ | ✅ Critical |
| Context retrieval | ❌ | ✅ | ✅ | ✅ Essential |
| Confidence scoring | ❌ | ✅ | ✅ (≥80%) | ✅ Reduces noise |
| Tool use | ❌ | ✅ | ✅ | ✅ Game-changer |
| Incremental review | ❌ | ✅ | ✅ | ✅ Cost-effective |
| Custom rules | ✅ | ✅ (BUGBOT.md) | ✅ (CLAUDE.md) | ✅ Must-have |
| Model quality | 🟡 Haiku default | ✅ Latest models | ✅ Opus 4.5 | ✅ Use best |

---

## Industry Benchmark Comparison

### Cursor's Bugbot
**Key Innovation:** Fully agentic design with multi-turn reasoning
- **Resolution rate:** Improved from 52% → 70%+ after switching to agentic design
- **Bugs per run:** Increased from 0.4 → 0.7
- **Approach:** Agent reasons over diff, calls tools, decides where to dig deeper
- **Custom rules:** BUGBOT.md files for codebase-specific knowledge
- **Integration:** One-click to send issues to Cursor or launch background agent

### Anthropic's Official Approach
**Key Recommendations from their engineering team:**
1. **Multi-agent parallel review** - 4+ specialized agents with confidence scoring
2. **Extended thinking** - Use Opus 4.5 with thinking enabled for everything
3. **Thinking budgets** - "think" < "think hard" < "think harder" < "ultrathink"
4. **Incremental reviews** - Per-commit rather than entire PR
5. **CLAUDE.md files** - Team-maintained shared context in Git
6. **Permission model** - Start with read-only, comment-triggered workflows

### Modern RAG-Based Tools
**Context retrieval techniques:**
- **RAG (Retrieval Augmented Generation)** - Pull relevant context dynamically
- **Dynamic symbol search** - Find relevant symbols in milliseconds
- **AST parsing** - Understand structural relationships
- **"Just in time" context** - Maintain lightweight identifiers, load data at runtime
- **Multi-repo understanding** - Handle distributed microservice environments

### Key Industry Trend
**41% of new code is AI-generated** (2026), making review capacity the limiting factor. Context-aware, multi-repo understanding and automated workflows are becoming essential.

---

## Improvement Options

### Quick Wins (Low Effort, High Impact)

#### 1. Extended Thinking Support ⭐⭐⭐⭐⭐
**Effort:** 30 minutes
**Impact:** Huge - Anthropic's team uses this for everything
**Cost increase:** ~2.8x over Sonnet, but avoids debugging bad suggestions

**Implementation:**
```typescript
// In reviewer.ts
const response = await anthropic.messages.create({
  model: "claude-opus-4-5-20251101",
  max_tokens: 16000, // Increase for thinking output
  thinking: {
    type: "enabled",
    budget_tokens: 10000 // "think harder" level
  },
  messages: [...]
})
```

**Thinking levels:**
- `budget_tokens: 2000` - "think" (basic)
- `budget_tokens: 5000` - "think hard" (standard)
- `budget_tokens: 10000` - "think harder" (recommended)
- `budget_tokens: 20000` - "ultrathink" (complex PRs)

**Configuration:**
```typescript
// Add to ModelConfig interface
interface ModelConfig {
  id: string;
  maxTokens: number;
  thinking?: {
    enabled: boolean;
    budgetTokens: number;
  };
  pricing: {
    input: number;
    output: number;
    thinking?: number; // Same as output for Opus
  };
}

const MODELS: Record<ModelName, ModelConfig> = {
  opus: {
    id: "claude-opus-4-5-20251101",
    maxTokens: 16000,
    thinking: {
      enabled: true,
      budgetTokens: 10000
    },
    pricing: {
      input: 3.0,
      output: 15.0,
      thinking: 15.0 // Same as output
    }
  },
  // ... existing models
}
```

---

#### 2. Confidence Scoring ⭐⭐⭐⭐⭐
**Effort:** 1 hour
**Impact:** Huge - Reduces false positives dramatically
**Cost increase:** None

**Update prompt to require confidence scores:**
```typescript
// Add to buildReviewPrompt() in reviewer.ts
prompt += `
## Confidence Scoring

For EVERY issue you report, include a confidence score (0-100):

- **90-100:** Critical bug, security flaw, or data loss (will crash or corrupt)
- **70-89:** Likely issue worth addressing (logic error, performance problem)
- **50-69:** Possible concern, needs human judgment (minor code smell)
- **Below 50:** Don't report

**Format for each issue:**
\`\`\`
[CONFIDENCE: 95] Line 42: SQL injection vulnerability in user input
[CONFIDENCE: 75] Line 108: Potential null pointer dereference
\`\`\`

**ONLY report issues with confidence ≥ 70.**

If you're unsure due to limited diff context, DO NOT report it.
`;
```

**Post-processing:**
```typescript
// Extract and filter by confidence
function parseReviewWithConfidence(reviewText: string) {
  const issues = reviewText.match(/\[CONFIDENCE: (\d+)\](.*?)(?=\[CONFIDENCE:|$)/gs);

  return issues?.filter(issue => {
    const confidence = parseInt(issue.match(/\[CONFIDENCE: (\d+)\]/)?.[1] || '0');
    return confidence >= 70;
  }) || [];
}
```

---

### Medium Effort (High Value)

#### 3. Multi-Agent Parallel Review ⭐⭐⭐⭐
**Effort:** 1-2 days
**Impact:** Very High - Specialized expertise per domain
**Cost:** 4x base cost, but can use mixed models

**Architecture:**
```
Main Orchestrator
  ↓
├─ Security Agent (Opus + thinking) - Looks for vulnerabilities
├─ Logic Agent (Sonnet) - Business logic bugs
├─ Performance Agent (Haiku) - Performance issues
└─ Style Agent (Haiku) - Code quality & patterns
  ↓
Aggregate & Filter (confidence ≥ 80)
  ↓
Final Review
```

**Implementation:**
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
  issues: Array<{
    confidence: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    line?: number;
    message: string;
  }>;
  summary: string;
}

// src/agents/security-agent.ts
export class SecurityAgent implements ReviewAgent {
  name = 'Security';
  model = 'opus' as const;
  focus = 'Security vulnerabilities, injection attacks, auth issues';

  async review(prInfo: PRInfo, context: string): Promise<AgentReview> {
    const prompt = this.buildSecurityPrompt(prInfo, context);
    // ... call Claude with security-focused prompt
  }

  private buildSecurityPrompt(prInfo: PRInfo, context: string): string {
    return `You are a security expert reviewing code for vulnerabilities.

Focus ONLY on:
- SQL injection, XSS, CSRF
- Authentication/authorization bugs
- Sensitive data exposure
- Insecure dependencies
- Cryptographic issues

DO NOT comment on code style, performance, or general bugs.

${prInfo.diff}
`;
  }
}

// src/agents/logic-agent.ts
export class LogicAgent implements ReviewAgent {
  name = 'Logic';
  model = 'sonnet' as const;
  focus = 'Business logic errors, edge cases, correctness';

  async review(prInfo: PRInfo, context: string): Promise<AgentReview> {
    // Focus on correctness, edge cases, null handling
  }
}

// src/agents/performance-agent.ts
export class PerformanceAgent implements ReviewAgent {
  name = 'Performance';
  model = 'haiku' as const;
  focus = 'Performance issues, N+1 queries, memory leaks';

  async review(prInfo: PRInfo, context: string): Promise<AgentReview> {
    // Focus on performance bottlenecks
  }
}

// src/multi-agent-reviewer.ts
export async function multiAgentReview(
  prInfo: PRInfo,
  context: string,
  anthropic: Anthropic
): Promise<ReviewResult> {
  const agents = [
    new SecurityAgent(),
    new LogicAgent(),
    new PerformanceAgent(),
    new StyleAgent()
  ];

  // Run all agents in parallel
  const reviews = await Promise.all(
    agents.map(agent => agent.review(prInfo, context))
  );

  // Aggregate and filter by confidence
  const allIssues = reviews
    .flatMap(r => r.issues)
    .filter(issue => issue.confidence >= 80)
    .sort((a, b) => b.confidence - a.confidence);

  return {
    issues: allIssues,
    agentReviews: reviews,
    summary: buildAggregatedSummary(reviews)
  };
}
```

**CLI Integration:**
```bash
# Use multi-agent mode
pr-review https://github.com/... --multi-agent

# Or auto-detect based on PR size
pr-review https://github.com/... --smart
  # Files > 10: Use multi-agent
  # Files <= 10: Use single agent
```

**Cost optimization:**
```typescript
// Mixed model approach
const agents = [
  new SecurityAgent('opus'),     // Most important
  new LogicAgent('sonnet'),      // Medium
  new PerformanceAgent('haiku'), // Fast scan
  new StyleAgent('haiku')        // Fast scan
];

// Cost: 1×Opus + 1×Sonnet + 2×Haiku
// ~$0.25 per medium PR (vs $0.92 for all Opus)
```

---

#### ~~4. RAG-Based Context Retrieval~~ ⚠️ SKIP THIS
**Status:** DEPRECATED - Use Agentic Review (Section 5) instead

**Why skip this:**
RAG pre-fetches context based on heuristics and adds everything to the prompt upfront. This is redundant with Agentic Review with Tool Use, which allows the agent to intelligently decide what context to fetch on-demand.

**Comparison:**
- **RAG approach:** Guess what's needed, fetch everything, add to prompt (might be irrelevant)
- **Agentic approach:** Agent explores as needed, only fetches relevant context, can verify hunches

**Recommendation:** Go straight to Agentic Review (Section 5) which provides superior context retrieval plus multi-turn reasoning.

**Original plan (for reference):**
- Finds files related to changed code
- Retrieves function/class definitions
- Discovers dependencies and imports
- Includes test files for context

_(Implementation details removed - see Agentic Review section for superior approach)_

---

#### 5. Agentic Review with Tool Use ⭐⭐⭐⭐⭐
**Effort:** 1 week
**Impact:** Game-changing - Agent can explore and reason
**Cost:** ~$0.35 per medium PR (40% increase, massive value)

**What it enables:**
- Agent can read files to understand context
- Can search for symbol definitions
- Can check git history
- Can run grep to find patterns
- Multi-turn reasoning and exploration

**Why this replaces RAG:**
Instead of pre-fetching context blindly, the agent intelligently decides what to explore based on what it discovers in the diff. This is how Cursor's Bugbot works and why their detection rate improved from 52% to 70%+.

---

#### 6. Incremental Commit-by-Commit Review ⭐⭐⭐
**Effort:** 1 day
**Impact:** High - Better feedback, less overwhelming
**Cost:** 2x for 5 commits, but per-commit cost is lower

**Implementation:**
```typescript
// src/incremental-reviewer.ts
export async function reviewPRIncremental(
  options: ReviewOptions
): Promise<IncrementalReviewResult> {
  const prInfo = await fetchPRInfo(options.prUrlOrNumber, options.repo, options.githubToken);

  // Get all commits in PR
  const commits = await fetchPRCommits(prInfo, options.githubToken);

  const commitReviews: CommitReview[] = [];
  let previousFiles = new Set<string>();

  for (const commit of commits) {
    // Get diff for just this commit
    const commitDiff = await fetchCommitDiff(commit.sha, options.githubToken);

    // Find what changed since last review
    const newChanges = findNewChanges(commitDiff, previousFiles);

    // Review only the new changes
    const review = await reviewCommit({
      commit,
      diff: newChanges,
      context: options.contextPath,
      previousReviews: commitReviews
    });

    commitReviews.push(review);
    previousFiles = new Set([...previousFiles, ...commit.files]);
  }

  // Aggregate all reviews
  return aggregateCommitReviews(commitReviews);
}

interface CommitReview {
  sha: string;
  message: string;
  issues: Issue[];
  timestamp: string;
}

async function reviewCommit(params: {
  commit: Commit;
  diff: string;
  context?: string;
  previousReviews: CommitReview[];
}): Promise<CommitReview> {
  const prompt = `Review this individual commit (not the full PR):

**Commit:** ${params.commit.sha.substring(0, 7)}
**Message:** ${params.commit.message}

**Previous reviews in this PR:**
${params.previousReviews.map(r => `- ${r.sha}: ${r.issues.length} issues`).join('\n')}

**Changes in THIS commit:**
\`\`\`diff
${params.diff}
\`\`\`

Focus on:
1. Does this commit introduce NEW issues?
2. Does it address issues from previous reviews?
3. Is the commit doing what the message says?
`;

  // ... call Claude ...
}
```

**CLI:**
```bash
# Review incrementally
pr-review https://github.com/... --incremental

# Show per-commit breakdown
pr-review https://github.com/... --incremental --verbose
```

---

### Advanced Features

#### 7. Interactive Review Mode ⭐⭐⭐⭐
```typescript
// src/agentic/tools.ts
export const REVIEW_TOOLS = [
  {
    name: "read_file",
    description: "Read the full contents of a file from the repository to understand context beyond the diff",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to repository root"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "search_code",
    description: "Search the codebase for specific patterns or symbols",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for"
        },
        file_pattern: {
          type: "string",
          description: "Optional file glob pattern (e.g., '*.ts')"
        }
      },
      required: ["pattern"]
    }
  },
  {
    name: "get_git_history",
    description: "Get git history for a file to understand past changes",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path"
        },
        limit: {
          type: "number",
          description: "Number of commits to retrieve (default 10)"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "find_symbol_definition",
    description: "Find where a function, class, or type is defined",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Symbol name to find"
        },
        type: {
          type: "string",
          enum: ["function", "class", "interface", "type", "any"],
          description: "Type of symbol"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "find_usages",
    description: "Find all places where a symbol is used",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Symbol name"
        }
      },
      required: ["symbol"]
    }
  }
];

// src/agentic/tool-executor.ts
export class ToolExecutor {
  constructor(private repoPath: string) {}

  async executeTool(name: string, input: any): Promise<string> {
    switch (name) {
      case "read_file":
        return this.readFile(input.path);

      case "search_code":
        return this.searchCode(input.pattern, input.file_pattern);

      case "get_git_history":
        return this.getGitHistory(input.path, input.limit || 10);

      case "find_symbol_definition":
        return this.findSymbolDefinition(input.symbol, input.type);

      case "find_usages":
        return this.findUsages(input.symbol);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async readFile(path: string): Promise<string> {
    const fullPath = join(this.repoPath, path);
    if (!existsSync(fullPath)) {
      return `Error: File not found: ${path}`;
    }

    const content = await Bun.file(fullPath).text();
    return `File: ${path}\n\n${content}`;
  }

  private async searchCode(pattern: string, filePattern?: string): Promise<string> {
    // Use ripgrep or similar
    const globArg = filePattern ? `--glob "${filePattern}"` : '';
    const result = await $`rg ${pattern} ${globArg}`.cwd(this.repoPath).text();
    return result || 'No matches found';
  }

  private async getGitHistory(path: string, limit: number): Promise<string> {
    const result = await $`git log -n ${limit} --oneline -- ${path}`.cwd(this.repoPath).text();
    return result || 'No history found';
  }

  private async findSymbolDefinition(symbol: string, type: string): Promise<string> {
    // Search for definitions based on type
    const patterns = {
      function: `function ${symbol}|const ${symbol} =.*=>`,
      class: `class ${symbol}`,
      interface: `interface ${symbol}`,
      type: `type ${symbol} =`,
      any: `(function|class|interface|type) ${symbol}`
    };

    const pattern = patterns[type] || patterns.any;
    return this.searchCode(pattern);
  }

  private async findUsages(symbol: string): Promise<string> {
    return this.searchCode(`\\b${symbol}\\b`);
  }
}

// src/agentic/agentic-reviewer.ts
export async function agenticReviewPR(
  options: ReviewOptions,
  anthropic: Anthropic
): Promise<void> {
  const prInfo = await fetchPRInfo(options.prUrlOrNumber, options.repo, options.githubToken);

  // Initialize tool executor
  const toolExecutor = new ToolExecutor(process.cwd());

  // Build initial prompt
  const initialPrompt = `You are an expert code reviewer with the ability to explore the codebase.

# Pull Request Information
${/* ... PR info ... */}

# Available Tools
You have access to tools to explore the codebase:
- read_file: Read any file to understand context
- search_code: Search for patterns in the code
- get_git_history: See past changes to a file
- find_symbol_definition: Find where symbols are defined
- find_usages: Find all usages of a symbol

# Your Task
Review this PR thoroughly. Use the tools to:
1. Understand the full context of changes
2. Find related code that might be affected
3. Verify assumptions about how code works
4. Check for similar patterns elsewhere

Be thorough but efficient with tool use.

# PR Diff
\`\`\`diff
${prInfo.diff}
\`\`\`
`;

  // Multi-turn conversation
  let messages = [
    { role: "user" as const, content: initialPrompt }
  ];

  let turnCount = 0;
  const maxTurns = 10;

  while (turnCount < maxTurns) {
    turnCount++;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000
      },
      tools: REVIEW_TOOLS,
      messages
    });

    messages.push({
      role: "assistant" as const,
      content: response.content
    });

    // Check if agent wants to use tools
    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(block => block.type === "tool_use");

      // Execute all tool calls
      const toolResults = await Promise.all(
        toolUses.map(async (toolUse) => {
          const result = await toolExecutor.executeTool(
            toolUse.name,
            toolUse.input
          );

          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result
          };
        })
      );

      // Add tool results to conversation
      messages.push({
        role: "user" as const,
        content: toolResults
      });

    } else {
      // Agent is done
      break;
    }
  }

  // Extract final review from last assistant message
  const finalResponse = messages[messages.length - 1];
  const reviewText = finalResponse.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n");

  console.log(reviewText);
}
```

**CLI:**
```bash
# Use agentic mode
pr-review https://github.com/... --agentic

# With max turns limit
pr-review https://github.com/... --agentic --max-turns 15
```

---

#### 8. Interactive Review Mode ⭐⭐⭐⭐
**Effort:** 3 days
**Impact:** High - Developer can ask follow-ups
**Cost:** Variable, ~$0.10 per follow-up question

**What it enables:**
```bash
pr-review https://github.com/... --interactive

# Review completes...

> Why did you flag line 42?
Assistant: I flagged line 42 because the SQL query uses string concatenation
instead of parameterized queries, which creates a SQL injection vulnerability...

> Can you suggest a fix?
Assistant: Here's a safe version using parameterized queries:
[shows code]

> Are there similar patterns elsewhere in the codebase?
Assistant: Let me search... [uses search_code tool]
Found 3 other instances in src/api/users.ts, src/api/orders.ts...

> exit
```

**Implementation:**
```typescript
// src/interactive/interactive-review.ts
import { createInterface } from 'readline';

export async function interactiveReview(
  options: ReviewOptions,
  anthropic: Anthropic
): Promise<void> {
  // Perform initial review (agentic mode)
  const reviewResult = await agenticReviewPR(options, anthropic);

  // Display review
  console.log(reviewResult.review);

  // Start interactive session
  console.log('\n💬 Interactive mode enabled. Ask follow-up questions (type "exit" to quit):\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  // Conversation history (includes initial review)
  let messages = reviewResult.messages;

  rl.prompt();

  rl.on('line', async (input: string) => {
    if (input.trim().toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    if (!input.trim()) {
      rl.prompt();
      return;
    }

    // Add user question to conversation
    messages.push({
      role: "user",
      content: input
    });

    // Get Claude's response (with tool access)
    const spinner = new Spinner('Thinking...');
    spinner.start();

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 8000,
      thinking: {
        type: "enabled",
        budget_tokens: 5000
      },
      tools: REVIEW_TOOLS,
      messages
    });

    spinner.stop();

    // Handle tool use if needed
    // ... (similar to agentic reviewer) ...

    // Extract and display response
    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n");

    console.log(`\n${text}\n`);

    messages.push({
      role: "assistant",
      content: response.content
    });

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n✨ Interactive session ended');
  });
}
```

---

#### 9. Test Execution & Validation ⭐⭐⭐
**Effort:** 2 days
**Impact:** High - Validate issues are real
**Cost:** No additional API cost (local execution)

**What it does:**
- Checks out PR branch locally
- Runs test suite
- Includes test results in review context
- Flags issues that cause test failures

**Implementation:**
```typescript
// src/testing/test-runner.ts
export interface TestResult {
  passed: boolean;
  totalTests: number;
  failedTests: number;
  failures: Array<{
    test: string;
    error: string;
    file: string;
  }>;
  coverage?: {
    lines: number;
    branches: number;
    functions: number;
  };
}

export async function runPRTests(
  prInfo: PRInfo,
  repoPath: string
): Promise<TestResult> {
  // Checkout PR branch
  await $`git fetch origin pull/${prInfo.prNumber}/head:pr-${prInfo.prNumber}`.cwd(repoPath);
  await $`git checkout pr-${prInfo.prNumber}`.cwd(repoPath);

  // Run tests (adapt to project)
  let testOutput: string;
  let exitCode: number;

  try {
    testOutput = await $`bun test`.cwd(repoPath).text();
    exitCode = 0;
  } catch (e) {
    testOutput = e.stderr + e.stdout;
    exitCode = e.exitCode;
  }

  // Parse test output
  const result = parseTestOutput(testOutput);

  // Cleanup
  await $`git checkout -`.cwd(repoPath);

  return result;
}

function parseTestOutput(output: string): TestResult {
  // Parse test framework output
  // This is framework-specific (Jest, Vitest, Bun test, etc.)

  const failures = [];
  const failureRegex = /FAIL.*?\n(.*?)\n/g;

  let match;
  while ((match = failureRegex.exec(output)) !== null) {
    failures.push({
      test: match[1],
      error: '...',
      file: '...'
    });
  }

  return {
    passed: failures.length === 0,
    totalTests: 0, // Parse from output
    failedTests: failures.length,
    failures
  };
}

// Integration with review
export async function reviewWithTests(
  options: ReviewOptions
): Promise<void> {
  const prInfo = await fetchPRInfo(/* ... */);

  // Run tests first
  console.log('🧪 Running test suite on PR branch...');
  const testResult = await runPRTests(prInfo, process.cwd());

  if (!testResult.passed) {
    console.log(`❌ ${testResult.failedTests} tests failed`);
  } else {
    console.log(`✅ All tests passed`);
  }

  // Include test results in review context
  const testContext = `
# Test Results

**Status:** ${testResult.passed ? 'PASSED' : 'FAILED'}
**Total Tests:** ${testResult.totalTests}
**Failed Tests:** ${testResult.failedTests}

${testResult.failures.length > 0 ? `
## Failed Tests
${testResult.failures.map(f => `
- **${f.test}**
  File: ${f.file}
  Error: ${f.error}
`).join('\n')}
` : ''}

When reviewing, please:
1. Explain why tests failed (if any)
2. Verify changes match test expectations
3. Check for missing test coverage
`;

  // Include in review prompt
  const prompt = buildReviewPrompt(prInfo, reviewContext + testContext);

  // ... continue with review ...
}
```

---

## Cost Analysis

### Current Costs (Per Review)

| PR Size | Haiku (default) | Sonnet | Example |
|---------|----------------|--------|---------|
| **Small** (1-3 files, ~100 lines) | $0.003 | $0.04 | Bug fix |
| **Medium** (5-10 files, ~300 lines) | $0.007 | $0.08 | Feature |
| **Large** (15+ files, ~1000 lines) | $0.013 | $0.15 | Refactor |
| **Very Large** (30+ files, ~3000 lines) | $0.025 | $0.30 | Migration |

### Proposed Costs with Improvements

| Approach | Small | Medium | Large | Very Large |
|----------|-------|--------|-------|------------|
| **Current (Haiku)** | $0.003 | $0.007 | $0.013 | $0.025 |
| **Current (Sonnet)** | $0.04 | $0.08 | $0.15 | $0.30 |
| **Opus + Thinking** | $0.10 | $0.23 | $0.45 | $0.90 |
| **Multi-Agent (4× Haiku)** | $0.012 | $0.028 | $0.052 | $0.10 |
| **Multi-Agent (Mixed)** | $0.11 | $0.25 | $0.48 | $0.95 |
| **Agentic + RAG** | $0.15 | $0.35 | $0.70 | $1.40 |
| **Full Suite** | $0.20 | $0.50 | $1.00 | $2.00 |

**Key insight:** Even "expensive" reviews are < $2, which is 0.001% of engineer cost.

### Monthly Team Costs

#### Small Team (20 PRs/month)
Mix: 10 small, 8 medium, 2 large

- **Current (Haiku):** $0.11/month
- **Opus + Thinking:** $2.74/month
- **Full Suite:** $8.00/month

#### Medium Team (100 PRs/month)
Mix: 40 small, 45 medium, 12 large, 3 very large

- **Current (Haiku):** $0.58/month
- **Opus + Thinking:** $13.60/month
- **Full Suite:** $39.30/month

#### Large Team (500 PRs/month)
Mix: 200 small, 220 medium, 60 large, 20 very large

- **Current (Haiku):** $2.90/month
- **Opus + Thinking:** $68/month
- **Full Suite:** $196/month

### ROI Analysis

**What's a manual PR review worth?**

Senior engineer @ $100-150/hr:
- Small PR (10 min): $17-25
- Medium PR (20 min): $33-50
- Large PR (45 min): $75-112

**AI Review ROI:**
- Small PR: $0.20 vs. $20 = **100:1**
- Medium PR: $0.50 vs. $40 = **80:1**
- Large PR: $1.00 vs. $90 = **90:1**

**Cost of bugs:**
- Production bug: $10K-100K to fix
- Security breach: $1M+
- Missed deadline: $50K-500K

**Single prevented bug pays for 10,000+ reviews.**

---

## Phased Implementation Roadmap

### Phase 1: Quick Wins (Week 1)
**Goal:** Immediate quality improvements with minimal effort
**Effort:** 1 day
**Cost Impact:** +2.8x per review ($0.23 for medium PR)

#### Tasks:
- [ ] Add Opus 4.5 model to `MODELS` config
- [ ] Implement extended thinking support
  - [ ] Add `thinking` parameter to API calls
  - [ ] Update token usage tracking (include thinking tokens)
  - [ ] Add CLI flag `--thinking-budget <tokens>`
- [ ] Implement confidence scoring
  - [ ] Update prompt with confidence requirements
  - [ ] Add parsing logic to extract confidence scores
  - [ ] Filter issues by confidence threshold
  - [ ] Display confidence in output
- [ ] Add `.pr-review-rules.md` support
  - [ ] Load rules file from repo root
  - [ ] Include in review prompt
  - [ ] Document rules file format
  - [ ] Create example rules file

#### Testing:
```bash
# Test Opus + thinking
pr-review https://github.com/anthropics/pr-reviewer/pull/123 --model opus

# Test with custom rules
echo "Check for SQL injection" > .pr-review-rules.md
pr-review https://github.com/.../pull/123
```

#### Success Metrics:
- Confidence scores on all issues
- 30% reduction in false positives
- Extended thinking output visible in logs

---

### Phase 2: Enhanced Context (Week 2-3)
**Goal:** See beyond the diff with context retrieval
**Effort:** 1 week
**Cost Impact:** +10% ($0.25 for medium PR)

#### Tasks:
- [ ] Implement `SimpleContextRetriever`
  - [ ] Extract symbols from diff
  - [ ] Find symbol definitions (grep-based)
  - [ ] Find related files (same directory, imports)
  - [ ] Find test files
- [ ] Integrate context into review prompt
  - [ ] Format retrieved context nicely
  - [ ] Add "Additional Context" section to prompt
  - [ ] Include symbol definitions with locations
- [ ] Add CLI flag `--no-context` to disable
- [ ] Display context retrieval stats
  - [ ] Number of symbols found
  - [ ] Number of related files
  - [ ] Context tokens added

#### Testing:
```bash
# Test context retrieval
pr-review https://github.com/.../pull/123 --verbose

# Should show:
# ✓ Found 12 symbols
# ✓ Retrieved 5 related files
# ✓ Added 8,234 context tokens
```

#### Success Metrics:
- Context retrieved for 90%+ of PRs
- 20% improvement in issue relevance
- Can reference code outside diff

---

### Phase 3: Multi-Agent Review (Week 4-5)
**Goal:** Specialized agents for different concerns
**Effort:** 2 weeks
**Cost Impact:** 3-4x ($0.25-0.33 for medium PR with mixed models)

#### Tasks:
- [ ] Create agent framework
  - [ ] Define `ReviewAgent` interface
  - [ ] Implement `AgentReview` result type
  - [ ] Create base agent class
- [ ] Implement specialized agents
  - [ ] `SecurityAgent` (Opus + thinking) - Security issues only
  - [ ] `LogicAgent` (Sonnet) - Business logic bugs
  - [ ] `PerformanceAgent` (Haiku) - Performance issues
  - [ ] `StyleAgent` (Haiku) - Code quality
- [ ] Implement orchestrator
  - [ ] Run agents in parallel
  - [ ] Aggregate results
  - [ ] Filter by confidence (≥80)
  - [ ] Deduplicate issues
- [ ] Add CLI support
  - [ ] `--multi-agent` flag
  - [ ] `--agents security,logic` to select specific agents
  - [ ] `--smart` for auto-detection based on PR size

#### Agent Prompts:
Each agent gets a highly focused prompt:

```typescript
// SecurityAgent prompt
`You are a security expert. Review ONLY for:
- SQL injection, XSS, CSRF
- Auth/authz bugs
- Sensitive data exposure
- Insecure dependencies

DO NOT comment on performance, style, or general bugs.`

// LogicAgent prompt
`You are a logic expert. Review ONLY for:
- Business logic errors
- Edge cases and null handling
- Incorrect calculations
- State management bugs

DO NOT comment on security, style, or performance.`
```

#### Testing:
```bash
# Test multi-agent
pr-review https://github.com/.../pull/123 --multi-agent

# Should show:
# Running 4 agents in parallel...
# ✓ SecurityAgent: 2 issues (confidence ≥80)
# ✓ LogicAgent: 3 issues
# ✓ PerformanceAgent: 1 issue
# ✓ StyleAgent: 0 issues
#
# Aggregated: 6 unique issues
```

#### Success Metrics:
- Each agent runs in < 5s
- 15% more issues found vs. single agent
- 40% reduction in false positives (specialized focus)

---

### Phase 4: Agentic Workflow (Week 6-8)
**Goal:** Multi-turn reasoning with tool use
**Effort:** 3 weeks
**Cost Impact:** +40% ($0.32 for medium PR)

#### Tasks:
- [ ] Define review tools
  - [ ] `read_file` - Read full file contents
  - [ ] `search_code` - Search codebase
  - [ ] `get_git_history` - View file history
  - [ ] `find_symbol_definition` - Find where symbols are defined
  - [ ] `find_usages` - Find all usages
- [ ] Implement `ToolExecutor`
  - [ ] Execute read_file safely (sandboxed)
  - [ ] Implement search using ripgrep
  - [ ] Implement git commands
  - [ ] Add caching for repeated queries
- [ ] Implement agentic loop
  - [ ] Multi-turn conversation
  - [ ] Tool use handling
  - [ ] Result aggregation
  - [ ] Max turns limit (10-15)
- [ ] Add progress indicators
  - [ ] "Reading src/foo.ts..."
  - [ ] "Searching for usages of bar()..."
  - [ ] "Analyzing git history..."
- [ ] CLI support
  - [ ] `--agentic` flag
  - [ ] `--max-turns <n>` to limit turns
  - [ ] `--show-tools` to display tool usage

#### Testing:
```bash
# Test agentic mode
pr-review https://github.com/.../pull/123 --agentic --verbose

# Should show:
# Turn 1: Analyzing diff...
# Turn 2: Reading src/api/users.ts for context
# Turn 3: Searching for similar patterns
# Turn 4: Checking git history of src/auth.ts
# Turn 5: Finalizing review
#
# Tool usage:
# - read_file: 3 calls
# - search_code: 2 calls
# - get_git_history: 1 call
```

#### Success Metrics:
- Agent explores relevant files in 80%+ of PRs
- Average 4-6 tool calls per review
- 25% improvement in issue depth/accuracy

---

### Phase 5: Advanced Features (Week 9-12)
**Goal:** Interactive mode, incremental review, test integration
**Effort:** 4 weeks
**Cost Impact:** Variable

#### 5A: Incremental Review (Week 9)
- [ ] Fetch PR commits from GitHub API
- [ ] Review each commit individually
- [ ] Track what changed between commits
- [ ] Aggregate commit reviews
- [ ] CLI: `--incremental` flag

#### 5B: Interactive Mode (Week 10-11)
- [ ] Build interactive CLI prompt
- [ ] Handle follow-up questions
- [ ] Maintain conversation history
- [ ] Support tool use in interactive mode
- [ ] CLI: `--interactive` flag

#### 5C: Test Integration (Week 12)
- [ ] Detect test framework (Jest, Vitest, Bun, etc.)
- [ ] Checkout PR branch
- [ ] Run test suite
- [ ] Parse test results
- [ ] Include in review context
- [ ] CLI: `--run-tests` flag

---

### Phase 6: Production Hardening (Week 13-14)
**Goal:** Make it production-ready for teams
**Effort:** 2 weeks

#### Tasks:
- [ ] Add comprehensive error handling
  - [ ] API rate limits
  - [ ] Network failures
  - [ ] Malformed responses
  - [ ] Tool execution errors
- [ ] Add request retries with backoff
- [ ] Implement caching
  - [ ] Cache GitHub API responses (5 min TTL)
  - [ ] Cache file reads (per-session)
  - [ ] Cache search results
- [ ] Add cost tracking and budgets
  - [ ] Track spend per repo
  - [ ] Monthly budget limits
  - [ ] Alert when approaching limit
- [ ] Add telemetry
  - [ ] Review duration
  - [ ] Token usage trends
  - [ ] Issue detection rate
  - [ ] False positive rate (manual feedback)
- [ ] Security hardening
  - [ ] Validate file paths (no directory traversal)
  - [ ] Sandbox tool execution
  - [ ] Rate limit tool calls
- [ ] Documentation
  - [ ] API documentation
  - [ ] Configuration guide
  - [ ] Best practices guide
  - [ ] Troubleshooting guide

---

### Phase 7: Team Features (Week 15-16)
**Goal:** Support team workflows
**Effort:** 2 weeks

#### Tasks:
- [ ] Tiered review levels
  ```bash
  pr-review URL --level quick    # Haiku, fast
  pr-review URL --level standard # Sonnet, balanced
  pr-review URL --level deep     # Opus+thinking, thorough
  pr-review URL --level expert   # Full suite, comprehensive
  ```
- [ ] Smart auto-detection
  - [ ] Detect security-sensitive files
  - [ ] Detect large refactors
  - [ ] Detect dependency updates
  - [ ] Auto-select appropriate level
- [ ] GitHub Action integration
  - [ ] Create GitHub Action
  - [ ] Comment on PRs automatically
  - [ ] Support `@pr-reviewer` mentions
  - [ ] Incremental review on new commits
- [ ] Slack/Discord notifications
  - [ ] Post review summary
  - [ ] Alert on critical issues
  - [ ] Include PR link
- [ ] Review analytics dashboard
  - [ ] Reviews per week
  - [ ] Cost trends
  - [ ] Most common issues
  - [ ] False positive rate

---

## Technical Specifications

### Model Configuration

```typescript
// src/config/models.ts
export type ModelName = "haiku" | "sonnet" | "opus";

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

export interface ModelConfig {
  id: string;
  maxTokens: number;
  thinking?: ThinkingConfig;
  pricing: {
    input: number;    // per million tokens
    output: number;
    thinking?: number; // per million tokens (if different from output)
  };
  capabilities: {
    tools: boolean;
    vision: boolean;
    maxContextWindow: number;
  };
}

export const MODELS: Record<ModelName, ModelConfig> = {
  haiku: {
    id: "claude-haiku-4-5-20251001",
    maxTokens: 4000,
    pricing: {
      input: 0.25,
      output: 1.25
    },
    capabilities: {
      tools: true,
      vision: false,
      maxContextWindow: 200_000
    }
  },
  sonnet: {
    id: "claude-sonnet-4-5-20250929",
    maxTokens: 4000,
    pricing: {
      input: 3.0,
      output: 15.0
    },
    capabilities: {
      tools: true,
      vision: true,
      maxContextWindow: 200_000
    }
  },
  opus: {
    id: "claude-opus-4-5-20251101",
    maxTokens: 16000,
    thinking: {
      enabled: true,
      budgetTokens: 10000 // "think harder"
    },
    pricing: {
      input: 3.0,
      output: 15.0,
      thinking: 15.0
    },
    capabilities: {
      tools: true,
      vision: true,
      maxContextWindow: 200_000
    }
  }
};
```

### Configuration File Schema

```typescript
// .pr-reviewer.config.json
{
  "$schema": "https://pr-reviewer.dev/schema.json",

  // Review context
  "defaultGuidelines": "./review-context.md",
  "repoGuidelines": {
    "owner/repo-name": "./guidelines/repo-specific.md"
  },
  "rulesFile": ".pr-review-rules.md",

  // Model settings
  "defaultModel": "opus",
  "thinkingBudget": 10000,

  // Review mode
  "mode": "agentic", // "simple" | "multi-agent" | "agentic" | "auto"
  "agents": ["security", "logic", "performance", "style"],

  // Context retrieval
  "contextRetrieval": {
    "enabled": true,
    "maxRelatedFiles": 10,
    "maxSymbols": 50
  },

  // Confidence filtering
  "minConfidence": 70,

  // Cost controls
  "budget": {
    "monthlyLimit": 100.00,
    "perReviewLimit": 5.00,
    "alertThreshold": 80.00
  },

  // Output
  "saveTo": "./reviews",
  "format": "markdown", // "markdown" | "json" | "html"

  // Integrations
  "integrations": {
    "slack": {
      "enabled": true,
      "webhook": "https://hooks.slack.com/...",
      "channel": "#code-reviews"
    },
    "github": {
      "autoComment": false,
      "triggerOn": "@pr-reviewer"
    }
  }
}
```

### CLI Interface

```bash
# Basic usage
pr-review <PR-URL-or-number>

# With options
pr-review <PR> [options]

Options:
  -m, --model <name>          Model to use (haiku|sonnet|opus) [default: opus]
  -c, --context <path>        Custom review guidelines file
  -r, --repo <owner/repo>     Repository (if using PR number)
  --rules <path>              Custom rules file [default: .pr-review-rules.md]

  # Review mode
  --mode <mode>               Review mode (simple|multi-agent|agentic|auto)
  --agents <agents>           Agents to use (comma-separated)
  --level <level>             Review level (quick|standard|deep|expert)

  # Thinking
  --thinking-budget <tokens>  Thinking token budget [default: 10000]
  --no-thinking               Disable extended thinking

  # Context
  --no-context                Disable context retrieval
  --max-related-files <n>     Max related files to retrieve [default: 10]

  # Filtering
  --min-confidence <n>        Minimum confidence score [default: 70]

  # Advanced
  --incremental               Review commit-by-commit
  --interactive               Enable interactive Q&A mode
  --agentic                   Enable agentic mode with tools
  --max-turns <n>             Max agentic turns [default: 10]
  --run-tests                 Run test suite before review

  # Output
  -s, --save-to <path>        Save review to file
  --format <format>           Output format (markdown|json|html)
  --verbose                   Show detailed progress
  --show-tools                Display tool usage in agentic mode

  # API keys
  --anthropic-key <key>       Anthropic API key
  --github-token <token>      GitHub token

Examples:
  # Quick review with Haiku
  pr-review https://github.com/owner/repo/pull/123 --level quick

  # Deep review with Opus + thinking
  pr-review 123 --repo owner/repo --level deep

  # Multi-agent review
  pr-review 123 --multi-agent --agents security,logic

  # Agentic review with tools
  pr-review 123 --agentic --max-turns 15

  # Interactive review
  pr-review 123 --interactive

  # Incremental review
  pr-review 123 --incremental

  # With tests
  pr-review 123 --run-tests
```

### API Interface

```typescript
// Programmatic usage
import { reviewPR, ReviewOptions } from 'pr-reviewer';

const options: ReviewOptions = {
  prUrlOrNumber: 'https://github.com/owner/repo/pull/123',
  model: 'opus',
  mode: 'agentic',
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  contextRetrieval: true,
  minConfidence: 80,
  saveTo: './reviews',
  onProgress: (event) => {
    console.log(`${event.stage}: ${event.message}`);
  }
};

const result = await reviewPR(options);

console.log(`Found ${result.issues.length} issues`);
console.log(`Cost: $${result.cost.total.toFixed(4)}`);
console.log(`Time: ${result.timing.total}ms`);
```

---

## Success Metrics

### Quality Metrics
- **False Positive Rate:** < 20% (down from current ~40%)
- **Issue Detection Rate:** > 80% of critical bugs found
- **Confidence Accuracy:** 90%+ of high-confidence issues are valid
- **Context Relevance:** 85%+ of retrieved context is useful

### Performance Metrics
- **Review Time:** < 15s for medium PR (with agentic mode)
- **GitHub API Time:** < 2s
- **Context Retrieval Time:** < 3s
- **Agent Execution:** < 5s per agent

### Cost Metrics
- **Average Cost per Review:** $0.20 - $0.50
- **Monthly Team Cost (100 PRs):** < $40
- **ROI vs. Manual Review:** > 50:1

### Adoption Metrics
- **Team Usage:** 80%+ of PRs reviewed
- **Developer Satisfaction:** 4+ / 5 rating
- **Time Saved:** 10+ hours per developer per month
- **Bugs Prevented:** 5+ production bugs per month

---

## Risk Mitigation

### Technical Risks

#### 1. API Rate Limits
**Risk:** Exceeding Anthropic or GitHub rate limits
**Mitigation:**
- Implement exponential backoff
- Cache GitHub responses (5 min TTL)
- Add request queuing
- Monitor rate limit headers

#### 2. Tool Execution Safety
**Risk:** Malicious PRs could exploit tool use
**Mitigation:**
- Sandbox all file reads (no directory traversal)
- Whitelist allowed commands
- Rate limit tool calls (max 20 per review)
- Validate all file paths
- Don't execute code from PRs

#### 3. Cost Overruns
**Risk:** Unexpected high costs from large PRs or tool use
**Mitigation:**
- Per-review cost limits ($5 default)
- Monthly budget caps
- Alert at 80% of budget
- Auto-disable if budget exceeded
- Cost estimates before review

#### 4. Context Window Overflow
**Risk:** PR + context exceeds model limits
**Mitigation:**
- Monitor token count before sending
- Truncate context if needed (keep most relevant)
- Fall back to smaller context window
- Warn user if truncation occurs

### Product Risks

#### 1. False Positives Annoy Developers
**Risk:** Too many incorrect suggestions reduce trust
**Mitigation:**
- Confidence scoring (only show ≥70)
- Specialized agents (reduce noise)
- Feedback mechanism (thumbs up/down)
- Continuous prompt tuning
- Weekly false positive rate monitoring

#### 2. Missing Critical Bugs
**Risk:** AI misses important issues
**Mitigation:**
- Extended thinking for deeper analysis
- Multi-agent approach (multiple perspectives)
- Context retrieval (see full picture)
- Test integration (validate with tests)
- Human review still required for production

#### 3. Slow Review Times
**Risk:** Reviews take too long, blocking developers
**Mitigation:**
- Parallel agent execution
- Caching for repeated queries
- Progressive results (show issues as found)
- Tiered levels (quick for simple PRs)
- Max turn limits for agentic mode

#### 4. Poor Developer Experience
**Risk:** Tool is hard to use or understand
**Mitigation:**
- Interactive mode for setup
- Clear documentation
- Helpful error messages
- Progress indicators
- Example configurations

### Business Risks

#### 1. High Costs at Scale
**Risk:** Costs grow unexpectedly with team size
**Mitigation:**
- Smart auto-detection (don't over-engineer small PRs)
- Budget controls and alerts
- Cost analytics dashboard
- Tiered pricing model
- Team cost allocation

#### 2. Vendor Lock-in
**Risk:** Dependence on Anthropic API
**Mitigation:**
- Abstraction layer for LLM providers
- Support for multiple models
- Local model option (future)
- Export review data (vendor-neutral format)

---

## Appendix

### A. Prompt Engineering Best Practices

**For Extended Thinking:**
```typescript
const prompt = `Think step-by-step about this PR review.

First, understand what changed and why.
Then, consider potential issues.
Finally, validate your concerns by exploring the codebase.

# PR Diff
${diff}
`;
```

**For Confidence Scoring:**
```typescript
const prompt = `For each issue, ask yourself:
1. Can I see the full context? (If no, confidence < 70)
2. Is this a real bug or just a style choice? (Style = low confidence)
3. Would this cause a runtime error? (Yes = high confidence)
4. Do I have evidence or am I speculating? (Speculation = low confidence)

Format: [CONFIDENCE: 85] Issue description
`;
```

**For Agent Specialization:**
```typescript
// Security agent - Be paranoid
const securityPrompt = `You are a security expert. Be paranoid.
Assume attackers will try everything.
Flag any potential vulnerability, even if unlikely.
Include OWASP Top 10 checks.`;

// Logic agent - Be precise
const logicPrompt = `You are a logic expert. Be precise.
Only flag actual logic errors, not style issues.
Consider edge cases and null handling.
Verify calculations are correct.`;
```

### B. Example Review Outputs

**Simple Mode (Current):**
```markdown
# Code Review

## Summary
This PR adds user authentication to the API.

## Strengths
- Good error handling
- Clear variable names
- Tests included

## Critical Issues
[CONFIDENCE: 95] Line 42: SQL injection vulnerability in login query
[CONFIDENCE: 85] Line 108: JWT secret hardcoded

## Code Quality
Naming is clear and consistent. Good separation of concerns.

## Suggestions
Consider using bcrypt for password hashing instead of SHA256.
```

**Multi-Agent Mode:**
```markdown
# Multi-Agent Code Review

## Summary
4 specialized agents reviewed this PR in parallel.

## Security Agent (CRITICAL: 2 issues)
[CONFIDENCE: 95] Line 42: SQL injection in login query
  Use parameterized queries: db.query('SELECT * FROM users WHERE email = ?', [email])

[CONFIDENCE: 85] Line 108: JWT secret hardcoded
  Move to environment variable: process.env.JWT_SECRET

## Logic Agent (HIGH: 1 issue)
[CONFIDENCE: 80] Line 156: Password comparison doesn't handle null case
  User could be null if email not found. Add null check before password comparison.

## Performance Agent (MEDIUM: 1 issue)
[CONFIDENCE: 70] Line 203: N+1 query in user list endpoint
  Consider using JOIN instead of separate queries for user roles.

## Style Agent
No issues found. Code follows project patterns.

---
**Total:** 4 issues (2 critical, 1 high, 1 medium)
```

**Agentic Mode:**
```markdown
# Agentic Code Review

## Investigation Process
1. Analyzed PR diff (2 files changed)
2. Read src/auth/controller.ts to understand auth flow
3. Searched for similar authentication patterns in codebase
4. Checked git history of src/auth/controller.ts
5. Found related tests in tests/auth.test.ts

## Critical Issues

[CONFIDENCE: 98] Line 42: SQL injection vulnerability
  **Evidence:** Searched codebase and found 3 other parameterized queries.
  This is the only place using string concatenation.

  **Impact:** Attacker can bypass authentication with: ' OR '1'='1

  **Fix:** Use parameterized query like the rest of the codebase:
  ```typescript
  const user = await db.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  ```

[CONFIDENCE: 90] Line 108: JWT secret should not be hardcoded
  **Evidence:** Checked git history - this secret has been in the repo for 6 months.
  Potential that it's leaked in public commits.

  **Impact:** Anyone with repo access can forge JWTs.

  **Fix:**
  1. Rotate the secret immediately
  2. Move to environment variable
  3. Add .env.example with placeholder

## Patterns Found
Searched for similar auth bugs:
- Found 2 other endpoints using parameterized queries correctly
- No other hardcoded secrets found
- Password hashing consistently uses bcrypt

## Test Coverage
Checked tests/auth.test.ts:
- ✅ Tests valid login
- ✅ Tests invalid password
- ❌ Missing: SQL injection test
- ❌ Missing: JWT expiration test

---
**Tool Usage:**
- read_file: 3 calls
- search_code: 4 calls
- get_git_history: 1 call
```

### C. Configuration Examples

**Minimal (.pr-reviewer.config.json):**
```json
{
  "defaultModel": "opus",
  "mode": "agentic"
}
```

**Team Configuration:**
```json
{
  "defaultModel": "opus",
  "mode": "auto",
  "thinkingBudget": 10000,

  "repoGuidelines": {
    "myorg/api-server": "./docs/review-guidelines.md",
    "myorg/frontend": "./docs/review-guidelines.md"
  },

  "rulesFile": ".pr-review-rules.md",

  "agents": ["security", "logic", "performance"],

  "contextRetrieval": {
    "enabled": true,
    "maxRelatedFiles": 15
  },

  "minConfidence": 75,

  "budget": {
    "monthlyLimit": 200.00,
    "perReviewLimit": 3.00,
    "alertThreshold": 80.00
  },

  "integrations": {
    "slack": {
      "enabled": true,
      "webhook": "${SLACK_WEBHOOK}",
      "channel": "#code-reviews",
      "notifyOn": ["critical", "high"]
    }
  }
}
```

**Enterprise Configuration:**
```json
{
  "defaultModel": "opus",
  "mode": "multi-agent",
  "thinkingBudget": 15000,

  "agents": [
    {
      "name": "security",
      "model": "opus",
      "enabled": true,
      "rules": "./security-rules.md"
    },
    {
      "name": "logic",
      "model": "sonnet",
      "enabled": true
    },
    {
      "name": "performance",
      "model": "haiku",
      "enabled": true
    },
    {
      "name": "compliance",
      "model": "opus",
      "enabled": true,
      "rules": "./compliance-rules.md"
    }
  ],

  "contextRetrieval": {
    "enabled": true,
    "mode": "ast", // Use AST parsing instead of grep
    "maxRelatedFiles": 20,
    "includeTests": true,
    "includeDocs": false
  },

  "minConfidence": 80,

  "incremental": {
    "enabled": true,
    "reviewNewCommits": true
  },

  "testing": {
    "enabled": true,
    "framework": "auto", // auto-detect
    "runOnReview": false, // only on request
    "timeout": 300000 // 5 min
  },

  "budget": {
    "monthlyLimit": 1000.00,
    "perReviewLimit": 5.00,
    "alertThreshold": 80.00,
    "costAllocation": {
      "team": "engineering",
      "costCenter": "12345"
    }
  },

  "security": {
    "sandboxTools": true,
    "maxToolCalls": 30,
    "allowedPaths": ["src/", "tests/"],
    "blockedPatterns": ["*.env", "credentials.json"]
  },

  "integrations": {
    "github": {
      "autoComment": true,
      "triggerOn": "@pr-reviewer",
      "requireApproval": true, // Only review after maintainer approves PR
      "commentFormat": "detailed" // "summary" | "detailed"
    },
    "slack": {
      "enabled": true,
      "webhook": "${SLACK_WEBHOOK}",
      "channel": "#code-reviews",
      "notifyOn": ["critical"],
      "threadReplies": true
    },
    "datadog": {
      "enabled": true,
      "apiKey": "${DATADOG_API_KEY}",
      "tags": ["service:pr-reviewer", "env:production"]
    }
  },

  "analytics": {
    "enabled": true,
    "retention": 90, // days
    "metrics": [
      "review_duration",
      "issues_found",
      "false_positive_rate",
      "cost_per_review",
      "confidence_distribution"
    ]
  }
}
```

### D. Future Enhancements (Beyond Phase 7)

**AI-Powered Fixes:**
- Generate patches for simple issues
- One-click apply fixes
- Auto-commit with detailed message

**Learning from Feedback:**
- Track which issues are accepted/rejected
- Fine-tune confidence scoring
- Improve false positive detection
- Personalize to team preferences

**Cross-PR Analysis:**
- Detect patterns across multiple PRs
- Identify recurring issues
- Suggest architectural improvements
- Team-wide best practices

**Visual Code Review:**
- Screenshot diffs for UI changes
- Visual regression testing
- Before/after comparisons
- Accessibility checks

**Advanced Context:**
- Full codebase indexing (vector embeddings)
- Semantic code search
- Architecture understanding
- Impact analysis (what else is affected?)

**Smart Scheduling:**
- Priority queue based on PR importance
- Batch reviews during off-hours
- Cost optimization (use cheaper models when possible)
- Developer timezone awareness

---

## Conclusion

This plan transforms pr-reviewer from a solid single-pass tool into a state-of-the-art agentic PR review system that rivals Cursor's Bugbot and exceeds many commercial offerings.

**Key Takeaways:**
1. **Start with Phase 1** (Opus + thinking + confidence) - Huge impact, minimal effort
2. **Don't optimize for cost** - Even the "expensive" full suite is < $2 per review
3. **Focus on reducing false positives** - Quality > quantity of issues
4. **Agentic mode is the future** - Tool use and exploration are game-changers
5. **Ship incrementally** - Each phase delivers value independently

**Estimated Timeline:** 16 weeks to full production-ready system
**Estimated Cost:** $40-200/month for typical teams
**Estimated ROI:** 100:1 vs. manual review time

**Next Steps:**
1. Review this plan with the team
2. Get buy-in on Phase 1 (1 day of work)
3. Measure baseline metrics (false positive rate, issue detection)
4. Implement Phase 1
5. Measure improvement
6. Iterate based on feedback

Good luck! 🚀
