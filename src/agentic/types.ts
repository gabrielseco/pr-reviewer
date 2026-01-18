import type Anthropic from "@anthropic-ai/sdk";

/**
 * Result of executing a tool
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  executionTimeMs: number;
}

/**
 * Statistics for tool usage
 */
export interface ToolUsageStats {
  toolName: string;
  callCount: number;
  totalTimeMs: number;
}

/**
 * Options for agentic review
 */
export interface AgenticReviewOptions {
  maxTurns: number;
  showTools: boolean;
  repoPath: string;
  verbose: boolean;
}

/**
 * Result of an agentic review
 */
export interface AgenticReviewResult {
  reviewText: string;
  turnCount: number;
  toolUsage: ToolUsageStats[];
  messages: Anthropic.MessageParam[];
}
