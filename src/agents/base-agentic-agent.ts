import Anthropic from "@anthropic-ai/sdk";
import { MODELS, type ModelName } from "../models";
import type { PRInfo } from "../github";
import { REVIEW_TOOLS } from "../agentic/tools";
import { ToolExecutor } from "../agentic/tool-executor";
import type { Issue } from "./base-agent";

export interface ToolUsageStats {
  toolName: string;
  callCount: number;
  totalTimeMs: number;
}

export interface AgenticAgentReview {
  agentName: string;
  issues: Issue[];
  summary: string;
  turnCount: number;
  toolUsage: ToolUsageStats[];
  explorationLog: string[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

export interface AgenticReviewAgent {
  name: string;
  model: ModelName;
  focus: string;
  maxTurns: number;
  review(
    prInfo: PRInfo,
    context: string,
    repoPath: string
  ): Promise<AgenticAgentReview>;
}

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
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (turnCount < this.maxTurns) {
      turnCount++;

      const modelConfig = MODELS[this.model];
      const response = await this.anthropic.messages.create({
        model: modelConfig.id,
        max_tokens: modelConfig.maxTokens,
        tools: REVIEW_TOOLS,
        messages,
        ...(modelConfig.thinking && {
          thinking: {
            type: "enabled",
            budget_tokens: modelConfig.thinking.budgetTokens,
          },
        }),
      });

      // Track token usage
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      messages.push({
        role: "assistant",
        content: response.content,
      });

      if (response.stop_reason === "end_turn") {
        break;
      }

      if (response.stop_reason === "max_tokens") {
        console.warn(`⚠️  ${this.name}: Hit max tokens limit`);
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolName = block.name;
            const toolInput = block.input as Record<string, unknown>;

            // Log exploration
            const inputStr = JSON.stringify(toolInput)
              .replace(/^{|}$/g, "")
              .replace(/"/g, "");
            explorationLog.push(`Turn ${turnCount}: ${toolName}(${inputStr})`);

            // Execute tool
            const startTime = Date.now();
            const executionResult = await toolExecutor.executeTool(
              toolName,
              toolInput
            );
            const executionTimeMs = Date.now() - startTime;

            // Track stats
            const stats = toolUsageMap.get(toolName) || {
              toolName,
              callCount: 0,
              totalTimeMs: 0,
            };
            stats.callCount++;
            stats.totalTimeMs += executionTimeMs;
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

    // Extract review text from last assistant message
    const lastMessage = messages[messages.length - 1];
    let reviewText = "";
    if (lastMessage?.role === "assistant") {
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
    const cost = this.calculateCost(totalInputTokens, totalOutputTokens);

    return {
      agentName: this.name,
      issues,
      summary: this.extractSummary(reviewText),
      turnCount,
      toolUsage: Array.from(toolUsageMap.values()),
      explorationLog,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost,
      },
    };
  }

  protected abstract buildPrompt(prInfo: PRInfo, context: string): string;

  protected parseIssues(reviewText: string): Issue[] {
    const issues: Issue[] = [];
    const issuePattern =
      /\[CONFIDENCE:\s*(\d+)\](?:\s*(?:Line\s+(\d+):?|File:\s*([^\n]+))?)?\s*(.+?)(?=\[CONFIDENCE:|$)/gs;

    let match;
    while ((match = issuePattern.exec(reviewText)) !== null) {
      const confidence = parseInt(match[1] || "0");
      const line = match[2] ? parseInt(match[2]) : undefined;
      const file = match[3] || undefined;
      const message = match[4]?.trim() || "";

      let severity: Issue["severity"];
      if (confidence >= 90) severity = "critical";
      else if (confidence >= 80) severity = "high";
      else if (confidence >= 70) severity = "medium";
      else severity = "low";

      issues.push({
        confidence,
        severity,
        line,
        file,
        message,
      });
    }

    return issues;
  }

  protected extractSummary(reviewText: string): string {
    const summaryMatch = reviewText.match(/## Summary\s*\n(.+?)(?=\n##|$)/s);
    return summaryMatch?.[1]?.trim() || "No summary provided";
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const modelConfig = MODELS[this.model];
    const inputCost = (inputTokens / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelConfig.pricing.output;
    return inputCost + outputCost;
  }
}
