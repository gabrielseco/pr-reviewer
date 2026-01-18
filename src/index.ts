#!/usr/bin/env bun
import { Command } from "commander";
import { reviewPR } from "./reviewer";
import { runInteractive } from "./interactive";
import { loadConfig, getGuidelinesForRepo } from "./config";

const program = new Command();

program
  .name("pr-reviewer")
  .description("AI-powered GitHub PR reviewer using Anthropic Claude")
  .version("1.0.0");

// Reusable review handler to avoid duplication
async function handleReviewCommand(
  prUrlOrNumber: string | undefined,
  options: {
    context?: string;
    repo?: string;
    anthropicKey?: string;
    githubToken?: string;
    saveTo?: string;
    model?: "haiku" | "sonnet" | "opus";
    thinkingBudget?: number;
    minConfidence?: number;
  }
) {
  try {
    // If no PR URL provided, run interactive mode
    if (!prUrlOrNumber) {
      const interactive = await runInteractive();
      prUrlOrNumber = interactive.prUrlOrNumber;
      options.context = options.context || interactive.contextPath;
      options.repo = options.repo || interactive.repo;
    }

    // Load config for auto-detection
    const config = await loadConfig();

    // Auto-detect guidelines from config if not explicitly provided
    if (!options.context) {
      const autoGuidelines = await getGuidelinesForRepo(prUrlOrNumber, config);
      if (autoGuidelines) {
        console.log(`ℹ️  Using guidelines from config: ${autoGuidelines}`);
        options.context = autoGuidelines;
      }
    }

    const anthropicKey = options.anthropicKey || process.env.ANTHROPIC_API_KEY;
    const githubToken = options.githubToken || process.env.GITHUB_PRD_TOKEN;

    if (!anthropicKey) {
      console.error(
        "Error: Anthropic API key is required. Set ANTHROPIC_API_KEY env var or use --anthropic-key"
      );
      process.exit(1);
    }

    if (!githubToken) {
      console.error(
        "Error: GitHub token is required. Set GITHUB_PRD_TOKEN env var or use --github-token"
      );
      process.exit(1);
    }

    await reviewPR({
      prUrlOrNumber,
      contextPath: options.context,
      repo: options.repo,
      anthropicKey,
      githubToken,
      saveTo: options.saveTo,
      model: options.model,
      thinkingBudget: options.thinkingBudget,
      minConfidence: options.minConfidence,
    });
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Configure options for both the 'review' command and default action
function configureReviewOptions(cmd: Command) {
  return cmd
    .argument(
      "[pr-url-or-number]",
      "GitHub PR URL or PR number (omit for interactive mode)"
    )
    .option(
      "-c, --context <path>",
      "Path to markdown file with review context/guidelines"
    )
    .option(
      "-r, --repo <owner/repo>",
      "GitHub repository (required if using PR number)"
    )
    .option(
      "-m, --model <model>",
      "AI model to use: haiku (fast, cheap), sonnet (balanced), or opus (most capable, extended thinking)",
      "haiku"
    )
    .option(
      "--thinking-budget <tokens>",
      "Thinking token budget for opus model (default: 10000)",
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          throw new Error("thinking-budget must be a number between 0 and 100");
        }
        return parsed;
      }
    )
    .option(
      "--min-confidence <score>",
      "Minimum confidence score to display issues (0-100, default: 70)",
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          throw new Error("min-confidence must be a number between 0 and 100");
        }
        return parsed;
      }
    )
    .option(
      "--anthropic-key <key>",
      "Anthropic API key (or set ANTHROPIC_API_KEY env var)"
    )
    .option(
      "--github-token <token>",
      "GitHub token (or set GITHUB_PRD_TOKEN env var)"
    )
    .option(
      "-s, --save-to <path>",
      "Path to save review as markdown file (e.g., /path/to/reviews)"
    );
}

// Register the 'review' command
configureReviewOptions(
  program.command("review").description("Review a GitHub pull request")
).action(handleReviewCommand);

// Make 'review' the default command when no command is specified
configureReviewOptions(program).action(handleReviewCommand);

program.parse();
