#!/usr/bin/env bun
import { Command } from "commander";
import { reviewPR } from "./reviewer";
import { runInteractive } from "./interactive";
import { loadConfig, getGuidelinesForRepo } from "./config";
import { fetchPRInfo } from "./github";
import { analyzePR } from "./pr-analyzer";
import { generateRecommendations } from "./recommendation-engine";
import { promptUserSelection } from "./interactive-suggester";

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
    interactive?: boolean;
    agentic?: boolean;
    maxTurns?: number;
    showTools?: boolean;
    repoPath?: string;
    multiAgent?: boolean;
    agents?: string;
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
      interactive: options.interactive,
      agentic: options.agentic,
      maxTurns: options.maxTurns,
      showTools: options.showTools,
      repoPath: options.repoPath,
      multiAgent: options.multiAgent,
      agents: options.agents ? options.agents.split(",").map(a => a.trim()) : undefined,
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
    )
    .option(
      "-i, --interactive",
      "Enable interactive Q&A mode after review completion"
    )
    .option(
      "--agentic",
      "Enable agentic mode with tool use for deeper code exploration"
    )
    .option(
      "--max-turns <number>",
      "Maximum number of agentic turns (default: 10)",
      (value) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 30) {
          throw new Error("max-turns must be a number between 1 and 30");
        }
        return parsed;
      }
    )
    .option(
      "--show-tools",
      "Display tool usage during agentic review"
    )
    .option(
      "--repo-path <path>",
      "Local repository path for tool execution (defaults to current working directory)"
    )
    .option(
      "--multi-agent",
      "Enable multi-agent review mode with specialized agents"
    )
    .option(
      "--agents <list>",
      "Comma-separated list of agents to use (security,logic,performance,style)"
    );
}

// Handler for 'suggest' command
async function handleSuggestCommand(
  prUrlOrNumber: string | undefined,
  options: {
    repo?: string;
    githubToken?: string;
    anthropicKey?: string;
    context?: string;
    saveTo?: string;
    repoPath?: string;
  }
) {
  try {
    // If no PR URL provided, run interactive mode
    if (!prUrlOrNumber) {
      const interactive = await runInteractive();
      prUrlOrNumber = interactive.prUrlOrNumber;
      options.repo = options.repo || interactive.repo;
    }

    const githubToken = options.githubToken || process.env.GITHUB_PRD_TOKEN;

    if (!githubToken) {
      console.error(
        "Error: GitHub token is required. Set GITHUB_PRD_TOKEN env var or use --github-token"
      );
      process.exit(1);
    }

    // Fetch PR information
    console.log("🔍 Analyzing PR...\n");
    const prInfo = await fetchPRInfo(prUrlOrNumber, options.repo, githubToken);

    // Ask user to describe their changes
    console.log("📝 To provide better recommendations, please describe your changes:");
    console.log("   (e.g., 'refactor testing by mocking select component', 'add authentication', 'fix memory leak')\n");

    process.stdout.write("Your description: ");
    const userDescription = await new Promise<string>((resolve) => {
      const stdin = process.stdin;
      stdin.resume();
      stdin.setEncoding('utf8');

      let input = '';
      const onData = (chunk: string) => {
        const lines = chunk.split('\n');
        if (lines.length > 1) {
          input += lines[0];
          stdin.pause();
          stdin.removeListener('data', onData);
          console.log('');
          resolve(input.trim());
        } else {
          input += chunk;
        }
      };

      stdin.on('data', onData);
    });

    // Analyze the PR with user description
    const analysis = analyzePR(prInfo, userDescription);

    // Generate recommendations
    const recommendations = generateRecommendations(analysis);

    // Show interactive prompt and get user selection
    const selectedOption = await promptUserSelection(recommendations, analysis);

    if (!selectedOption) {
      // User cancelled
      return;
    }

    console.log(`\n▶️  Starting review with: ${selectedOption.name}\n`);

    // Parse the command string to extract options
    const commandParts = selectedOption.command.split(' ');
    const reviewOptions: any = {
      repo: options.repo,
      context: options.context,
      saveTo: options.saveTo,
      repoPath: options.repoPath,
    };

    // Parse command flags
    for (let i = 0; i < commandParts.length; i++) {
      const part = commandParts[i];

      if (part === '--multi-agent') {
        reviewOptions.multiAgent = true;
      } else if (part === '--agentic') {
        reviewOptions.agentic = true;
      } else if (part === '--model') {
        reviewOptions.model = commandParts[++i];
      } else if (part === '--agents') {
        reviewOptions.agents = commandParts[++i];
      } else if (part === '--min-confidence') {
        reviewOptions.minConfidence = parseInt(commandParts[++i] || '0');
      } else if (part === '--max-turns') {
        reviewOptions.maxTurns = parseInt(commandParts[++i] || '10');
      } else if (part === '--show-tools') {
        reviewOptions.showTools = true;
      }
    }

    // Execute the review with parsed options
    await handleReviewCommand(prUrlOrNumber, reviewOptions);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Register the 'suggest' command
program
  .command("suggest")
  .description("Analyze PR and suggest the best review mode")
  .argument(
    "[pr-url-or-number]",
    "GitHub PR URL or PR number (omit for interactive mode)"
  )
  .option(
    "-r, --repo <owner/repo>",
    "GitHub repository (required if using PR number)"
  )
  .option(
    "--github-token <token>",
    "GitHub token (or set GITHUB_PRD_TOKEN env var)"
  )
  .option(
    "--anthropic-key <key>",
    "Anthropic API key (or set ANTHROPIC_API_KEY env var)"
  )
  .option(
    "-c, --context <path>",
    "Path to markdown file with review context/guidelines"
  )
  .option(
    "-s, --save-to <path>",
    "Path to save review as markdown file"
  )
  .option(
    "--repo-path <path>",
    "Local repository path for tool execution"
  )
  .action(handleSuggestCommand);

// Register the 'review' command
configureReviewOptions(
  program.command("review").description("Review a GitHub pull request")
).action(handleReviewCommand);

// Make 'review' the default command when no command is specified
configureReviewOptions(program).action(handleReviewCommand);

program.parse();
