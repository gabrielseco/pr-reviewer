import Anthropic from "@anthropic-ai/sdk";
import { fetchPRInfo } from "./github";
import { existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { Spinner, bell } from "./spinner";

export interface ReviewOptions {
  prUrlOrNumber: string;
  contextPath?: string;
  repo?: string;
  anthropicKey: string;
  githubToken: string;
  saveTo?: string;
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
  } = options;

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
  const claudeSpinner = new Spinner("Generating review with Claude AI");
  claudeSpinner.start();
  const claudeStartTime = performance.now();
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });
  const claudeDuration = performance.now() - claudeStartTime;
  claudeSpinner.succeed(
    `Generated review with Claude AI (${(claudeDuration / 1000).toFixed(2)}s)`
  );

  // Extract token usage and calculate costs
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  // Claude Haiku pricing (as of late 2024)
  // Input: $0.25 per million tokens, Output: $1.25 per million tokens
  const inputCost = (inputTokens / 1_000_000) * 0.25;
  const outputCost = (outputTokens / 1_000_000) * 1.25;
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
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  githubDuration: number;
  claudeDuration: number;
  totalDuration: number;
}

async function saveReviewToFile(
  savePath: string,
  prInfo: any,
  reviewContent: string,
  metadata: ReviewMetadata
): Promise<string> {
  // Create directory if it doesn't exist
  if (!existsSync(savePath)) {
    mkdirSync(savePath, { recursive: true });
  }

  // Generate filename: repo-name_pr-123_2024-01-15.md
  const date = new Date().toISOString().split("T")[0];
  const repoName = `${prInfo.owner}-${prInfo.repo}`.replace(
    /[^a-zA-Z0-9-_]/g,
    "_"
  );
  const filename = `${repoName}_pr-${prInfo.prNumber}_${date}.md`;
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

function buildReviewPrompt(prInfo: any, reviewContext: string): string {
  const filesInfo = prInfo.files
    .map(
      (f: any) =>
        `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`
    )
    .join("\n");

  let prompt = `You are an expert code reviewer. Please review the following GitHub pull request.

# Pull Request Information

**Title:** ${prInfo.title}

**Description:**
${prInfo.description || "No description provided"}

**Files Changed:**
${filesInfo}

`;

  if (reviewContext) {
    prompt += `# Review Context and Guidelines

The following context has been provided to guide your review:

${reviewContext}

`;
  }

  prompt += `# Pull Request Diff

\`\`\`diff
${prInfo.diff}
\`\`\`

# Review Instructions

Please provide a comprehensive code review that includes:

1. **Summary:** Brief overview of the changes
2. **Strengths:** What's done well in this PR
3. **Issues:** Any bugs, security concerns, or logic errors
4. **Code Quality:** Comments on code structure, readability, and best practices
5. **Suggestions:** Specific recommendations for improvements
${
  reviewContext
    ? "6. **Architecture/Guidelines Compliance:** How well the PR follows the provided guidelines"
    : ""
}

Please be constructive and specific in your feedback.`;

  return prompt;
}
