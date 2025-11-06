import Anthropic from "@anthropic-ai/sdk";
import { fetchPRInfo } from "./github";
import type { PRInfo } from "./github";
import { existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { Spinner, bell } from "./spinner";

// Model configuration
type ModelName = "haiku" | "sonnet";

interface ModelConfig {
  id: string;
  maxTokens: number;
  pricing: {
    input: number;
    output: number;
  };
}

const MODELS: Record<ModelName, ModelConfig> = {
  haiku: {
    id: "claude-haiku-4-5-20251001",
    maxTokens: 4000,
    pricing: {
      input: 0.25, // per million tokens
      output: 1.25,
    },
  },
  sonnet: {
    id: "claude-sonnet-4-5-20250929",
    maxTokens: 4000,
    pricing: {
      input: 3.0, // per million tokens
      output: 15.0,
    },
  },
} as const;

export interface ReviewOptions {
  prUrlOrNumber: string;
  contextPath?: string;
  repo?: string;
  anthropicKey: string;
  githubToken: string;
  saveTo?: string;
  model?: ModelName;
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
  } = options;

  // Get model configuration
  const modelConfig = MODELS[model];

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

  // Build the review prompt
  const prompt = buildReviewPrompt(prInfo, reviewContext);

  // Call Claude API with timing
  const claudeSpinner = new Spinner(
    `Generating review with Claude AI (${model})`
  );
  claudeSpinner.start();
  const claudeStartTime = performance.now();
  const message = await anthropic.messages.create({
    model: modelConfig.id,
    max_tokens: modelConfig.maxTokens,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const claudeDuration = performance.now() - claudeStartTime;
  claudeSpinner.succeed(
    `Generated review with Claude AI (${model}) (${(
      claudeDuration / 1000
    ).toFixed(2)}s)`
  );

  // Extract token usage and calculate costs
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  // Calculate costs using model-specific pricing
  const inputCost = (inputTokens / 1_000_000) * modelConfig.pricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelConfig.pricing.output;
  const totalCost = inputCost + outputCost;

  // Display the review
  console.log("=".repeat(80));
  console.log("CODE REVIEW");
  console.log("=".repeat(80));
  console.log();

  const textContent = message.content.find((block) => block.type === "text");
  const reviewText =
    textContent && textContent.type === "text" ? textContent.text : "";

  if (reviewText) {
    console.log(reviewText);
  }

  console.log();
  console.log("=".repeat(80));

  // Display timing and cost information
  const totalDuration = performance.now() - startTime;
  console.log("\n📊 Review Statistics:");
  console.log(`   Model: ${model} (${modelConfig.id})`);
  console.log(`   GitHub API time: ${(githubDuration / 1000).toFixed(2)}s`);
  console.log(`   Claude API time: ${(claudeDuration / 1000).toFixed(2)}s`);
  console.log(`   Total time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`\n💰 Token Usage & Cost:`);
  console.log(`   Input tokens: ${inputTokens.toLocaleString()}`);
  console.log(`   Output tokens: ${outputTokens.toLocaleString()}`);
  console.log(
    `   Total tokens: ${(inputTokens + outputTokens).toLocaleString()}`
  );
  console.log(
    `   Cost: $${totalCost.toFixed(4)} ($${inputCost.toFixed(
      4
    )} input + $${outputCost.toFixed(4)} output)`
  );
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
      totalCost,
      githubDuration,
      claudeDuration,
      totalDuration,
    });
    saveSpinner.succeed(`Review saved to: ${savedFilePath}`);
  }

  // Bell notification to alert user that review is complete
  bell();
  console.log("\n✨ Review complete!");
}

interface ReviewMetadata {
  model: ModelName;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  githubDuration: number;
  claudeDuration: number;
  totalDuration: number;
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
input_tokens: ${metadata.inputTokens}
output_tokens: ${metadata.outputTokens}
total_tokens: ${metadata.inputTokens + metadata.outputTokens}
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

- **Model:** ${metadata.model} (${metadata.modelId})
- **Input Tokens:** ${metadata.inputTokens.toLocaleString()}
- **Output Tokens:** ${metadata.outputTokens.toLocaleString()}
- **Total Tokens:** ${(
    metadata.inputTokens + metadata.outputTokens
  ).toLocaleString()}
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

function buildReviewPrompt(prInfo: PRInfo, reviewContext: string): string {
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
