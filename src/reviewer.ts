import Anthropic from "@anthropic-ai/sdk";
import { fetchPRInfo } from "./github";
import type { PRInfo } from "./github";
import { existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { Spinner, bell } from "./spinner";
import { startInteractiveQA } from "./interactive-qa";
import { agenticReviewPR } from "./agentic/agentic-reviewer";
import type { AgenticReviewOptions } from "./agentic/types";
import { MODELS, type ModelName } from "./models.js";
import { multiAgentReview, type MultiAgentOptions } from "./multi-agent-reviewer.js";
import { multiAgenticReview, type MultiAgenticOptions } from "./multi-agent-agentic-reviewer.js";

export interface ReviewOptions {
  prUrlOrNumber: string;
  contextPath?: string;
  repo?: string;
  anthropicKey: string;
  githubToken: string;
  saveTo?: string;
  model?: ModelName;
  thinkingBudget?: number; // Override thinking budget for models that support it
  minConfidence?: number; // Minimum confidence score to display (0-100, default: 70)
  interactive?: boolean; // Enable interactive Q&A mode after review
  agentic?: boolean; // Enable agentic mode with tool use
  maxTurns?: number; // Maximum number of agentic turns
  showTools?: boolean; // Display tool usage during review
  repoPath?: string; // Local repository path for tool execution
  multiAgent?: boolean; // Enable multi-agent review mode
  agents?: string[]; // Specific agents to use (default: all)
}

export async function reviewPR(options: ReviewOptions): Promise<void> {
  const startTime = performance.now();
  const {
    prUrlOrNumber,
    contextPath,
    repo,
    anthropicKey,
    githubToken,
    saveTo,
    model = "haiku",
    thinkingBudget,
    minConfidence = 70,
    interactive = false,
    agentic = false,
    maxTurns = 10,
    showTools = false,
    repoPath = process.cwd(),
    multiAgent = false,
    agents,
  } = options;

  // Get model configuration
  const modelConfig = MODELS[model];

  // Determine thinking configuration
  const thinkingConfig = modelConfig.thinking
    ? {
        type: "enabled" as const,
        budget_tokens: thinkingBudget || modelConfig.thinking.budgetTokens,
      }
    : undefined;

  // Load context file
  let reviewContext = "";
  if (contextPath) {
    if (existsSync(contextPath)) {
      const contextSpinner = new Spinner(
        `Loading review context from ${contextPath}`
      );
      contextSpinner.start();
      reviewContext = await readFile(contextPath, "utf-8");
      contextSpinner.succeed(`Loaded review context from ${contextPath}`);
    } else {
      console.warn(
        `⚠️  Warning: Context file not found at ${contextPath}. Proceeding without custom context.`
      );
    }
  }

  // Fetch PR information with timing
  const githubSpinner = new Spinner("Fetching PR information from GitHub");
  githubSpinner.start();
  const githubStartTime = performance.now();
  const prInfo = await fetchPRInfo(prUrlOrNumber, repo, githubToken);
  const githubDuration = performance.now() - githubStartTime;
  githubSpinner.succeed(
    `Fetched PR from GitHub (${(githubDuration / 1000).toFixed(2)}s)`
  );

  console.log(`\n📝 PR: ${prInfo.title}`);
  console.log(`📦 Repository: ${prInfo.owner}/${prInfo.repo}`);
  console.log(`📄 Files changed: ${prInfo.files.length}`);

  // Create Anthropic client
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // Variables for review results
  let reviewText: string;
  let conversationHistory: Anthropic.MessageParam[];
  let inputTokens: number;
  let outputTokens: number;
  let thinkingTokens: number = 0;
  let turnCount: number = 1;
  let claudeDuration: number = 0;

  // Check if multi-agent mode is enabled
  if (multiAgent && agentic) {
    // Multi-agent AGENTIC mode with tool access
    const multiAgenticOptions: MultiAgenticOptions = {
      agents,
      minConfidence,
      parallelExecution: true,
      repoPath,
      maxTurns,
      showTools,
    };

    const claudeSpinner = new Spinner(
      `Running agentic multi-agent review with tool access (${agents?.join(", ") || "all agents"})`
    );
    claudeSpinner.start();
    const claudeStartTime = performance.now();

    const result = await multiAgenticReview(
      prInfo,
      reviewContext,
      anthropic,
      multiAgenticOptions
    );

    claudeDuration = performance.now() - claudeStartTime;
    claudeSpinner.succeed(
      `Completed agentic multi-agent review (${(claudeDuration / 1000).toFixed(2)}s)`
    );

    // Display agent timing and tool usage
    console.log("\n📊 Agent Performance:");
    for (const [agentName, duration] of Object.entries(result.timing.perAgent)) {
      const agentReview = result.agentReviews.find((r) => r.agentName === agentName);
      const issueCount = agentReview?.issues.length || 0;
      const toolCount = agentReview?.toolUsage.reduce((sum, t) => sum + t.callCount, 0) || 0;
      console.log(
        `   ${agentName}: ${(duration / 1000).toFixed(2)}s (${issueCount} issues, ${toolCount} tool calls)`
      );
    }

    console.log(`\n🔧 Total Tool Calls: ${result.totalToolCalls}`);

    // Build review text from multi-agent agentic results
    reviewText = result.summary + "\n\n";

    // Group issues by severity
    const criticalIssues = result.issues.filter((i) => i.severity === "critical");
    const highIssues = result.issues.filter((i) => i.severity === "high");
    const mediumIssues = result.issues.filter((i) => i.severity === "medium");
    const lowIssues = result.issues.filter((i) => i.severity === "low");

    const formatIssues = (issues: typeof result.issues, title: string) => {
      if (issues.length === 0) return "";
      let text = `## ${title}\n\n`;
      for (const issue of issues) {
        text += `**[CONFIDENCE: ${issue.confidence}]** ${issue.line ? `Line ${issue.line}:` : ""} ${issue.message}\n\n`;
      }
      return text;
    };

    reviewText += formatIssues(criticalIssues, "Critical Issues");
    reviewText += formatIssues(highIssues, "High Priority Issues");
    reviewText += formatIssues(mediumIssues, "Medium Priority Issues");
    reviewText += formatIssues(lowIssues, "Low Priority Issues");

    // Calculate token usage from all agents
    inputTokens = result.agentReviews.reduce((sum, r) => sum + r.usage.inputTokens, 0);
    outputTokens = result.agentReviews.reduce((sum, r) => sum + r.usage.outputTokens, 0);

    // Build conversation history for interactive mode
    conversationHistory = [
      {
        role: "user",
        content: `Multi-agent agentic review of PR: ${prInfo.title}`,
      },
      {
        role: "assistant",
        content: reviewText,
      },
    ];
  } else if (multiAgent) {
    // Multi-agent mode with parallel execution (NO tools)
    const multiAgentOptions: MultiAgentOptions = {
      agents,
      minConfidence,
      parallelExecution: true,
    };

    const claudeSpinner = new Spinner(
      `Running multi-agent review (${agents?.join(", ") || "all agents"})`
    );
    claudeSpinner.start();
    const claudeStartTime = performance.now();

    const result = await multiAgentReview(
      prInfo,
      reviewContext,
      anthropic,
      multiAgentOptions
    );

    claudeDuration = performance.now() - claudeStartTime;
    claudeSpinner.succeed(
      `Completed multi-agent review (${(claudeDuration / 1000).toFixed(2)}s)`
    );

    // Display agent timing
    console.log("\n📊 Agent Performance:");
    for (const [agentName, duration] of Object.entries(result.timing.perAgent)) {
      const agentReview = result.agentReviews.find((r) => r.agentName === agentName);
      const issueCount = agentReview?.issues.length || 0;
      console.log(
        `   ${agentName}: ${(duration / 1000).toFixed(2)}s (${issueCount} issues found)`
      );
    }

    // Build review text from multi-agent results
    reviewText = result.summary + "\n\n";

    // Group issues by severity
    const criticalIssues = result.issues.filter((i) => i.severity === "critical");
    const highIssues = result.issues.filter((i) => i.severity === "high");
    const mediumIssues = result.issues.filter((i) => i.severity === "medium");
    const lowIssues = result.issues.filter((i) => i.severity === "low");

    const formatIssues = (issues: typeof result.issues, title: string) => {
      if (issues.length === 0) return "";
      let text = `## ${title}\n\n`;
      for (const issue of issues) {
        text += `**[CONFIDENCE: ${issue.confidence}]** ${issue.line ? `Line ${issue.line}:` : ""} ${issue.message}\n\n`;
      }
      return text;
    };

    reviewText += formatIssues(criticalIssues, "Critical Issues");
    reviewText += formatIssues(highIssues, "High Priority Issues");
    reviewText += formatIssues(mediumIssues, "Medium Priority Issues");
    reviewText += formatIssues(lowIssues, "Low Priority Issues");

    // Calculate token usage from all agents
    inputTokens = result.agentReviews.reduce((sum, r) => sum + r.usage.inputTokens, 0);
    outputTokens = result.agentReviews.reduce((sum, r) => sum + r.usage.outputTokens, 0);

    // Build conversation history for interactive mode
    conversationHistory = [
      {
        role: "user",
        content: `Multi-agent review of PR: ${prInfo.title}`,
      },
      {
        role: "assistant",
        content: reviewText,
      },
    ];
  } else if (agentic) {
    // Agentic mode with tool use
    const agenticOptions: AgenticReviewOptions = {
      maxTurns,
      showTools,
      repoPath,
      verbose: true,
    };

    const claudeSpinner = new Spinner(
      `Performing agentic review with Claude AI (${model})`
    );
    claudeSpinner.start();
    const claudeStartTime = performance.now();

    // Prepare PR info for agentic reviewer
    const agenticPRInfo = {
      number: prInfo.prNumber,
      title: prInfo.title,
      description: prInfo.description || "No description provided",
      author: "GitHub User",
      files: prInfo.files
        .map(
          (f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`
        )
        .join("\n"),
      diff: prInfo.diff,
    };

    const result = await agenticReviewPR(
      agenticPRInfo,
      reviewContext,
      minConfidence,
      anthropic,
      modelConfig.id,
      agenticOptions
    );

    claudeDuration = performance.now() - claudeStartTime;
    claudeSpinner.succeed(
      `Completed agentic review in ${result.turnCount} turns (${(
        claudeDuration / 1000
      ).toFixed(2)}s)`
    );

    reviewText = result.reviewText;
    conversationHistory = result.messages;
    turnCount = result.turnCount;

    // Display tool usage stats
    if (result.toolUsage.length > 0) {
      console.log("\n📊 Tool Usage:");
      for (const tool of result.toolUsage) {
        console.log(
          `   ${tool.toolName}: ${tool.callCount} calls (${tool.totalTimeMs}ms total)`
        );
      }
    }

    // For agentic mode, we need to calculate token usage from all messages
    // This is a simplified approach - in production you'd track this more carefully
    inputTokens = 0;
    outputTokens = 0;
    // Note: We can't easily get exact token counts for agentic mode without storing
    // each API response. For now, we'll estimate or show N/A
    console.log(
      "\n⚠️  Note: Token usage tracking for agentic mode is limited. Use --show-tools for detailed execution info."
    );
  } else {
    // Standard single-pass review
    const prompt = buildReviewPrompt(prInfo, reviewContext, minConfidence);

    const claudeSpinner = new Spinner(
      `Generating review with Claude AI (${model}${thinkingConfig ? " + thinking" : ""})`
    );
    claudeSpinner.start();
    const claudeStartTime = performance.now();
    const message = await anthropic.messages.create({
      model: modelConfig.id,
      max_tokens: modelConfig.maxTokens,
      ...(thinkingConfig && { thinking: thinkingConfig }),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    claudeDuration = performance.now() - claudeStartTime;
    claudeSpinner.succeed(
      `Generated review with Claude AI (${model}${thinkingConfig ? " + thinking" : ""}) (${(
        claudeDuration / 1000
      ).toFixed(2)}s)`
    );

    // Extract token usage and calculate costs
    inputTokens = message.usage.input_tokens;
    outputTokens = message.usage.output_tokens;

    // For models with thinking, extract thinking tokens (if available)
    // @ts-expect-error - thinking_tokens may not exist in all responses
    thinkingTokens = message.usage.thinking_tokens || 0;

    // Extract review text
    const textContent = message.content.find((block) => block.type === "text");
    reviewText =
      textContent && textContent.type === "text" ? textContent.text : "";

    // Build conversation history for interactive mode
    conversationHistory = [
      {
        role: "user",
        content: prompt,
      },
      {
        role: "assistant",
        content: message.content,
      },
    ];
  }

  // Display the review
  console.log("\n" + "=".repeat(80));
  console.log("CODE REVIEW");
  console.log("=".repeat(80));
  console.log();

  if (reviewText) {
    console.log(reviewText);
  } else {
    console.log("No review text generated.");
  }

  console.log();
  console.log("=".repeat(80));

  // Calculate costs using model-specific pricing
  const inputCost = (inputTokens / 1_000_000) * modelConfig.pricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelConfig.pricing.output;
  const thinkingCost = modelConfig.pricing.thinking
    ? (thinkingTokens / 1_000_000) * modelConfig.pricing.thinking
    : 0;
  const totalCost = inputCost + outputCost + thinkingCost;

  // Display timing and cost information
  const totalDuration = performance.now() - startTime;
  console.log("\n📊 Review Statistics:");
  if (multiAgent) {
    console.log(`   Mode: multi-agent (${agents?.join(", ") || "all agents"})`);
  } else {
    console.log(`   Model: ${model} (${modelConfig.id})`);
  }
  if (agentic) {
    console.log(`   Mode: agentic (${turnCount} turns)`);
  }
  if (thinkingTokens > 0) {
    console.log(`   Thinking: enabled (${thinkingTokens.toLocaleString()} tokens)`);
  }
  console.log(`   Confidence threshold: ${minConfidence}% (only showing issues ≥${minConfidence})`);
  console.log(`   GitHub API time: ${(githubDuration / 1000).toFixed(2)}s`);
  console.log(`   Total time: ${(totalDuration / 1000).toFixed(2)}s`);

  if (!agentic || (inputTokens > 0 && outputTokens > 0)) {
    console.log(`\n💰 Token Usage & Cost:`);
    console.log(`   Input tokens: ${inputTokens.toLocaleString()}`);
    console.log(`   Output tokens: ${outputTokens.toLocaleString()}`);
    if (thinkingTokens > 0) {
      console.log(`   Thinking tokens: ${thinkingTokens.toLocaleString()}`);
    }
    console.log(
      `   Total tokens: ${(inputTokens + outputTokens + thinkingTokens).toLocaleString()}`
    );
    if (thinkingTokens > 0) {
      console.log(
        `   Cost: $${totalCost.toFixed(4)} ($${inputCost.toFixed(
          4
        )} input + $${outputCost.toFixed(4)} output + $${thinkingCost.toFixed(4)} thinking)`
      );
    } else {
      console.log(
        `   Cost: $${totalCost.toFixed(4)} ($${inputCost.toFixed(
          4
        )} input + $${outputCost.toFixed(4)} output)`
      );
    }
  }
  console.log(
    `\n🔗 Review URL: https://github.com/${prInfo.owner}/${prInfo.repo}/pull/${prInfo.prNumber}`
  );

  // Save review to file if saveTo is specified
  if (saveTo && reviewText) {
    const saveSpinner = new Spinner("Saving review to file");
    saveSpinner.start();
    const savedFilePath = await saveReviewToFile(saveTo, prInfo, reviewText, {
      model,
      modelId: modelConfig.id,
      inputTokens,
      outputTokens,
      thinkingTokens,
      totalCost,
      githubDuration,
      claudeDuration,
      totalDuration,
      minConfidence,
    });
    saveSpinner.succeed(`Review saved to: ${savedFilePath}`);
  }

  // Bell notification to alert user that review is complete
  bell();
  console.log("\n✨ Review complete!");

  // Start interactive Q&A mode if requested
  if (interactive) {
    // Conversation history is already built in both agentic and standard modes
    await startInteractiveQA({
      anthropic,
      modelId: modelConfig.id,
      prInfo,
      reviewContext,
      conversationHistory,
      minConfidence,
    });
  }
}

interface ReviewMetadata {
  model: ModelName;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalCost: number;
  githubDuration: number;
  claudeDuration: number;
  totalDuration: number;
  minConfidence: number;
}

async function saveReviewToFile(
  savePath: string,
  prInfo: PRInfo,
  reviewContent: string,
  metadata: ReviewMetadata
): Promise<string> {
  // Create directory if it doesn't exist
  if (!existsSync(savePath)) {
    mkdirSync(savePath, { recursive: true });
  }

  // Generate filename: repo-name_pr-123_haiku_2024-01-15.md
  const date = new Date().toISOString().split("T")[0];
  const repoName = `${prInfo.owner}-${prInfo.repo}`.replace(
    /[^a-zA-Z0-9-_]/g,
    "_"
  );
  const filename = `${repoName}_pr-${prInfo.prNumber}_${metadata.model}_${date}.md`;
  const filePath = join(savePath, filename);

  // Create markdown content with metadata
  const totalTokens = metadata.inputTokens + metadata.outputTokens + metadata.thinkingTokens;
  const markdown = `---
title: "PR Review: ${prInfo.title}"
repository: ${prInfo.owner}/${prInfo.repo}
pr_number: ${prInfo.prNumber}
pr_url: https://github.com/${prInfo.owner}/${prInfo.repo}/pull/${
    prInfo.prNumber
  }
review_date: ${new Date().toISOString()}
model: ${metadata.model}
model_id: ${metadata.modelId}
min_confidence: ${metadata.minConfidence}
input_tokens: ${metadata.inputTokens}
output_tokens: ${metadata.outputTokens}${
    metadata.thinkingTokens > 0
      ? `
thinking_tokens: ${metadata.thinkingTokens}`
      : ""
  }
total_tokens: ${totalTokens}
cost_usd: ${metadata.totalCost.toFixed(4)}
github_api_time_ms: ${Math.round(metadata.githubDuration)}
claude_api_time_ms: ${Math.round(metadata.claudeDuration)}
total_time_ms: ${Math.round(metadata.totalDuration)}
---

# PR Review: ${prInfo.title}

**Repository:** ${prInfo.owner}/${prInfo.repo}
**PR Number:** #${prInfo.prNumber}
**Review Date:** ${date}
**PR URL:** https://github.com/${prInfo.owner}/${prInfo.repo}/pull/${
    prInfo.prNumber
  }

## Review Metrics

- **Model:** ${metadata.model} (${metadata.modelId})${
    metadata.thinkingTokens > 0
      ? `
- **Thinking:** enabled (${metadata.thinkingTokens.toLocaleString()} tokens)`
      : ""
  }
- **Confidence Threshold:** ${metadata.minConfidence}% (only showing issues ≥${metadata.minConfidence})
- **Input Tokens:** ${metadata.inputTokens.toLocaleString()}
- **Output Tokens:** ${metadata.outputTokens.toLocaleString()}${
    metadata.thinkingTokens > 0
      ? `
- **Thinking Tokens:** ${metadata.thinkingTokens.toLocaleString()}`
      : ""
  }
- **Total Tokens:** ${totalTokens.toLocaleString()}
- **Cost:** $${metadata.totalCost.toFixed(4)}
- **GitHub API Time:** ${(metadata.githubDuration / 1000).toFixed(2)}s
- **Claude API Time:** ${(metadata.claudeDuration / 1000).toFixed(2)}s
- **Total Time:** ${(metadata.totalDuration / 1000).toFixed(2)}s

---

${reviewContent}
`;

  // Write to file using Bun
  await Bun.write(filePath, markdown);

  return filePath;
}

function buildReviewPrompt(prInfo: PRInfo, reviewContext: string, minConfidence: number): string {
  const filesInfo = prInfo.files
    .map(
      (f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`
    )
    .join("\n");

  let prompt = `You are an expert code reviewer. Please review the following GitHub pull request.

# Pull Request Information

**Title:** ${prInfo.title}

**Description:**
${prInfo.description || "No description provided"}

**Files Changed:**
${filesInfo}

# Pull Request Diff

\`\`\`diff
${prInfo.diff}
\`\`\`

`;

  // Show guidelines AFTER the code, so Claude can apply them with full context
  if (reviewContext) {
    prompt += `# Review Context and Guidelines

The following context and guidelines should be applied when reviewing the code above:

${reviewContext}

`;
  }

  prompt += `# Code Review Instructions

Please provide a code review with the following sections:

## Confidence Scoring

For EVERY issue you report, you MUST include a confidence score (0-100) using this format:

**[CONFIDENCE: 95] Line 42:** Description of the issue

**Confidence Score Guidelines:**
- **90-100:** Critical bug, security flaw, or data loss (will crash or corrupt)
- **70-89:** Likely issue worth addressing (logic error, performance problem)
- **50-69:** Possible concern, needs human judgment (minor code smell)
- **Below 50:** Don't report

**IMPORTANT:**
- **ONLY report issues with confidence ≥ ${minConfidence}**
- If you're unsure due to limited diff context, DO NOT report it
- Every issue MUST start with [CONFIDENCE: XX] format
- Be honest about uncertainty - don't inflate confidence scores

## 1. Summary

Brief overview of what this PR changes.

## 2. Strengths

What the code does well (e.g., clear logic, good error handling, follows patterns).

## 3. Critical Issues ONLY

**🚨 CRITICAL WARNING ABOUT DIFF CONTEXT:**

The diff provided shows only 3 lines of context around each change. This means:
- You CANNOT see complete function signatures, component props, or type definitions
- Parameters and variables may exist in the actual code but not be visible in the diff
- **NEVER claim a variable/parameter is "undefined" or "missing" just because you don't see its definition in the diff**
- **NEVER invent or speculate about what the full function signature looks like**
- If you cannot see the complete context, assume the code is correct

**Example:**
- ❌ BAD: "The \`employeeName\` parameter is missing from DrawerTimeOff"
- ✅ GOOD: Only flag if \`employeeName\` is being USED in the diff but clearly undefined

**IMPORTANT: Only report issues that would cause:**

- Runtime crashes or errors
- Type mismatches that a compiler like Elixir, TypeScript, or Rust would catch
- Logic bugs that produce wrong results
- Security vulnerabilities
- Data loss or corruption

Do NOT report:
- Undefined variables, type errors, or scope issues (TypeScript CI validates these completely)
- Variables/parameters you cannot see in the diff context - assume they exist
- Do not mention or speculate about variable definitions - if the code was submitted for review, assume the build passed
- Theoretical concerns or "what-ifs"
- Defensive programming patterns (optional chaining + fallbacks are good)
- Different calculations for different purposes
- Safe fallback values (e.g., \`?? 'Unknown'\`)
- Code that works correctly but could be "slightly better"

If there are NO critical issues, say "No critical issues found."

## 4. Code Quality

Comment ONLY on:

- Naming clarity (is the purpose obvious?)
- Readability (is it easy to follow?)
- Actual violations of the project's patterns (reference the guidelines if applicable)

Skip minor style preferences.

## 5. Suggestions (Optional)

ONLY include suggestions if:
- There's a genuine logic bug
- There's a real performance issue
- There's missing error handling that would cause crashes

Do NOT suggest code improvements, refactoring, or "could be clearer" changes.

If nothing qualifies, skip this section.${
    reviewContext
      ? `

## 6. Architecture/Guidelines Compliance

Check if the code follows the architectural patterns and guidelines provided above.
Only flag violations of actual documented patterns, not suggestions for how it "could" be written.`
      : ""
  }

---

**Important:** Be specific and cite exact line numbers. Avoid vague concerns.`;

  return prompt;
}
