import Anthropic from "@anthropic-ai/sdk";
import type {
  AgenticReviewOptions,
  AgenticReviewResult,
  ToolUsageStats,
} from "./types";
import { REVIEW_TOOLS } from "./tools";
import { ToolExecutor } from "./tool-executor";

export interface PRInfo {
  number: number;
  title: string;
  description: string;
  author: string;
  files: string;
  diff: string;
}

/**
 * Build the agentic review prompt with tool guidance
 */
function buildAgenticPrompt(
  prInfo: PRInfo,
  reviewContext: string,
  minConfidence: number
): string {
  return `You are an expert code reviewer. Review the following pull request and provide detailed feedback.

${reviewContext}

# Pull Request Information

**PR #${prInfo.number}: ${prInfo.title}**
Author: ${prInfo.author}

${prInfo.description ? `## Description\n${prInfo.description}\n` : ""}

## Files Changed
${prInfo.files}

## Diff
\`\`\`diff
${prInfo.diff}
\`\`\`

# Available Tools

You have access to several tools to explore the codebase and increase your confidence in the review:

- **read_file**: Read full file contents to understand implementation details
- **search_code**: Search for patterns across the codebase (e.g., find similar code, check for consistency)
- **get_git_history**: View commit history to understand evolution and context
- **find_symbol_definition**: Locate where functions/classes/types are defined
- **find_usages**: Find all usages of a symbol to understand impact

**When to use tools:**
- If you're unsure about how a function/class is used elsewhere, use find_usages
- If you need to see the full implementation of a changed file, use read_file
- If you want to verify naming consistency or find similar patterns, use search_code
- If you need context on why code exists, use get_git_history
- If you need to understand a type or function definition, use find_symbol_definition

Use tools to increase your confidence when you're uncertain about an issue or recommendation.

# Review Requirements

Provide a thorough code review including:

1. **Summary**: Brief overview of changes
2. **Issues Found**: List any bugs, security issues, performance problems, or code quality concerns
3. **Suggestions**: Recommendations for improvements
4. **Confidence Score**: Rate your confidence in this review from 0-100

**Important**: Your confidence score should be at least ${minConfidence}/100. If you're unsure about something, use the available tools to explore the codebase and increase your confidence before finalizing the review.

Format your final review in markdown.`;
}

/**
 * Perform agentic PR review with multi-turn tool use
 */
export async function agenticReviewPR(
  prInfo: PRInfo,
  reviewContext: string,
  minConfidence: number,
  anthropic: Anthropic,
  modelId: string,
  options: AgenticReviewOptions
): Promise<AgenticReviewResult> {
  const toolExecutor = new ToolExecutor(options.repoPath);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildAgenticPrompt(prInfo, reviewContext, minConfidence),
    },
  ];

  let turnCount = 0;
  const toolUsageMap = new Map<string, ToolUsageStats>();

  while (turnCount < options.maxTurns) {
    turnCount++;

    if (options.verbose) {
      console.log(`\n🔄 Turn ${turnCount}/${options.maxTurns}`);
    }

    // Call Claude with tools
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 16000,
      tools: REVIEW_TOOLS,
      messages,
    });

    // Add assistant message to history
    messages.push({
      role: "assistant",
      content: response.content,
    });

    // Check stop reason
    if (response.stop_reason === "end_turn") {
      if (options.verbose) {
        console.log("✓ Agent completed exploration");
      }
      break;
    }

    if (response.stop_reason === "max_tokens") {
      console.warn("⚠️  Warning: Response hit max tokens limit");
      break;
    }

    // Handle tool use
    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // Extract and execute all tool_use blocks
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const toolName = block.name;
          const toolInput = block.input;

          if (options.showTools) {
            console.log(`⠋ Using ${toolName}: ${JSON.stringify(toolInput)}`);
          }

          // Execute tool
          const executionResult = await toolExecutor.executeTool(
            toolName,
            toolInput
          );

          // Track usage stats
          const stats = toolUsageMap.get(toolName) || {
            toolName,
            callCount: 0,
            totalTimeMs: 0,
          };
          stats.callCount++;
          stats.totalTimeMs += executionResult.executionTimeMs;
          toolUsageMap.set(toolName, stats);

          if (options.showTools) {
            if (executionResult.success) {
              console.log(
                `✓ ${toolName}: ${executionResult.executionTimeMs}ms`
              );
            } else {
              console.log(`✗ ${toolName}: ${executionResult.error}`);
            }
          }

          // Build tool result
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

      // Add tool results to messages
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: toolResults,
        });
      }
    }
  }

  if (turnCount >= options.maxTurns) {
    console.warn(
      `⚠️  Warning: Reached maximum turns (${options.maxTurns}). Review may be incomplete.`
    );
  }

  // Extract final review text from last assistant message
  const lastMessage = messages[messages.length - 1];
  let reviewText = "";

  if (lastMessage.role === "assistant") {
    if (Array.isArray(lastMessage.content)) {
      // Extract text blocks
      for (const block of lastMessage.content) {
        if (block.type === "text") {
          reviewText += block.text;
        }
      }
    } else {
      reviewText = lastMessage.content;
    }
  }

  if (!reviewText) {
    reviewText = "Review could not be completed. Please try again.";
  }

  return {
    reviewText,
    turnCount,
    toolUsage: Array.from(toolUsageMap.values()),
    messages,
  };
}
