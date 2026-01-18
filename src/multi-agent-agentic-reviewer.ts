import Anthropic from "@anthropic-ai/sdk";
import { AgenticSecurityAgent } from "./agents/agentic-security-agent";
import { AgenticLogicAgent } from "./agents/agentic-logic-agent";
import { AgenticPerformanceAgent } from "./agents/agentic-performance-agent";
import { AgenticStyleAgent } from "./agents/agentic-style-agent";
import type {
  AgenticReviewAgent,
  AgenticAgentReview,
  ToolUsageStats,
} from "./agents/base-agentic-agent";
import type { Issue } from "./agents/base-agent";
import type { PRInfo } from "./github";

export interface MultiAgenticReviewResult {
  issues: Issue[];
  agentReviews: AgenticAgentReview[];
  summary: string;
  totalCost: number;
  totalToolCalls: number;
  timing: {
    total: number;
    perAgent: Record<string, number>;
  };
  toolUsage: {
    perAgent: Record<string, ToolUsageStats[]>;
    aggregated: ToolUsageStats[];
  };
}

export interface MultiAgenticOptions {
  agents?: string[]; // ["security", "logic", "performance", "style"]
  minConfidence?: number; // Default: 70
  parallelExecution?: boolean; // Default: true
  repoPath: string;
  maxTurns?: number; // Override max turns for all agents
  showTools?: boolean; // Show tool usage in console
}

export async function multiAgenticReview(
  prInfo: PRInfo,
  context: string,
  anthropic: Anthropic,
  options: MultiAgenticOptions
): Promise<MultiAgenticReviewResult> {
  const {
    agents: requestedAgents = ["security", "logic", "performance", "style"],
    minConfidence = 70,
    parallelExecution = true,
    repoPath,
    maxTurns,
    showTools = false,
  } = options;

  // Initialize requested agents
  const allAgents: Record<string, AgenticReviewAgent> = {
    security: new AgenticSecurityAgent(anthropic),
    logic: new AgenticLogicAgent(anthropic),
    performance: new AgenticPerformanceAgent(anthropic),
    style: new AgenticStyleAgent(anthropic),
  };

  // Override max turns if specified
  if (maxTurns) {
    Object.values(allAgents).forEach((agent) => {
      agent.maxTurns = maxTurns;
    });
  }

  const activeAgents = requestedAgents
    .map((name) => allAgents[name])
    .filter((agent) => agent !== undefined);

  if (activeAgents.length === 0) {
    throw new Error("No valid agents specified");
  }

  console.log(
    `\n🤖 Running agentic multi-agent review with tool access...\n`
  );

  const startTime = Date.now();
  const perAgentTiming: Record<string, number> = {};
  const perAgentToolUsage: Record<string, ToolUsageStats[]> = {};

  // Run agents in parallel or sequentially
  let reviews: AgenticAgentReview[];
  if (parallelExecution) {
    reviews = await Promise.all(
      activeAgents.map(async (agent) => {
        const agentStart = Date.now();
        console.log(`🔍 ${agent.name}`);

        const review = await agent.review(prInfo, context, repoPath);

        perAgentTiming[agent.name] = Date.now() - agentStart;
        perAgentToolUsage[agent.name] = review.toolUsage;

        // Show summary
        const timeInSec = (perAgentTiming[agent.name] || 0 / 1000).toFixed(1);
        const toolCount = review.toolUsage.reduce(
          (sum, t) => sum + t.callCount,
          0
        );

        if (showTools) {
          review.explorationLog.forEach((log) => {
            console.log(`  ${log}`);
          });
        }

        console.log(
          `  ✓ Completed in ${timeInSec}s - ${review.issues.length} issues found (${toolCount} tools used)\n`
        );

        return review;
      })
    );
  } else {
    reviews = [];
    for (const agent of activeAgents) {
      const agentStart = Date.now();
      console.log(`🔍 ${agent.name}`);

      const review = await agent.review(prInfo, context, repoPath);

      perAgentTiming[agent.name] = Date.now() - agentStart;
      perAgentToolUsage[agent.name] = review.toolUsage;

      const timeInSec = (perAgentTiming[agent.name] || 0 / 1000).toFixed(1);
      const toolCount = review.toolUsage.reduce((sum, t) => sum + t.callCount, 0);

      if (showTools) {
        review.explorationLog.forEach((log) => {
          console.log(`  ${log}`);
        });
      }

      console.log(
        `  ✓ Completed in ${timeInSec}s - ${review.issues.length} issues found (${toolCount} tools used)\n`
      );

      reviews.push(review);
    }
  }

  console.log(`Aggregating results...\n`);

  // Aggregate issues
  const allIssues = reviews.flatMap((r) => r.issues);

  // Filter by confidence
  const filteredIssues = allIssues.filter(
    (issue) => issue.confidence >= minConfidence
  );

  // Deduplicate similar issues
  const uniqueIssues = deduplicateIssues(filteredIssues);

  // Sort by confidence (highest first)
  uniqueIssues.sort((a, b) => b.confidence - a.confidence);

  // Calculate total cost
  const totalCost = reviews.reduce((sum, r) => sum + r.usage.cost, 0);

  // Calculate total tool calls
  const totalToolCalls = reviews.reduce(
    (sum, r) => sum + r.toolUsage.reduce((s, t) => s + t.callCount, 0),
    0
  );

  // Aggregate tool usage across agents
  const aggregatedToolUsage = aggregateToolUsage(Object.values(perAgentToolUsage).flat());

  // Build summary
  const summary = buildAgenticSummary(reviews, uniqueIssues, totalToolCalls);

  return {
    issues: uniqueIssues,
    agentReviews: reviews,
    summary,
    totalCost,
    totalToolCalls,
    timing: {
      total: Date.now() - startTime,
      perAgent: perAgentTiming,
    },
    toolUsage: {
      perAgent: perAgentToolUsage,
      aggregated: aggregatedToolUsage,
    },
  };
}

function deduplicateIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const unique: Issue[] = [];

  for (const issue of issues) {
    // Create a key based on line and similarity of message
    const key = `${issue.line || "global"}:${normalizeMessage(issue.message)}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  return unique;
}

function normalizeMessage(message: string): string {
  // Remove common variations to detect duplicates
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

function aggregateToolUsage(toolUsages: ToolUsageStats[]): ToolUsageStats[] {
  const aggregated = new Map<string, ToolUsageStats>();

  for (const usage of toolUsages) {
    const existing = aggregated.get(usage.toolName) || {
      toolName: usage.toolName,
      callCount: 0,
      totalTimeMs: 0,
    };

    existing.callCount += usage.callCount;
    existing.totalTimeMs += usage.totalTimeMs;
    aggregated.set(usage.toolName, existing);
  }

  return Array.from(aggregated.values()).sort((a, b) => b.callCount - a.callCount);
}

function buildAgenticSummary(
  reviews: AgenticAgentReview[],
  issues: Issue[],
  totalToolCalls: number
): string {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;

  let summary = `# Multi-Agent Agentic Code Review\n\n`;
  summary += `**Agents**: ${reviews.map((r) => r.agentName).join(", ")}\n`;
  summary += `**Total Issues**: ${issues.length}`;

  if (criticalCount > 0) summary += ` (${criticalCount} critical`;
  if (highCount > 0) summary += `, ${highCount} high`;
  if (mediumCount > 0) summary += `, ${mediumCount} medium`;
  if (criticalCount > 0 || highCount > 0 || mediumCount > 0) summary += `)`;

  summary += `\n`;
  summary += `**Total Tool Calls**: ${totalToolCalls} across ${reviews.length} agents\n`;
  summary += `**Exploration Time**: ${(
    reviews.reduce((sum, r) => sum + (r.turnCount || 0), 0) * 1.5
  ).toFixed(1)}s (approx)\n\n`;

  for (const review of reviews) {
    const agentIssues = issues.filter((i) =>
      review.issues.some((ri) => ri.message === i.message)
    );

    summary += `## ${review.agentName}\n\n`;

    if (review.explorationLog.length > 0) {
      summary += `**Exploration**: ${review.explorationLog.slice(0, 3).join(", ")}`;
      if (review.explorationLog.length > 3) {
        summary += ` (and ${review.explorationLog.length - 3} more)`;
      }
      summary += `\n\n`;
    }

    if (agentIssues.length === 0) {
      summary += `No issues found.\n\n`;
    } else {
      summary += `${agentIssues.length} issue(s)\n\n`;

      // Show issues
      for (const issue of agentIssues) {
        summary += `[CONFIDENCE: ${issue.confidence}]`;
        if (issue.line) summary += ` Line ${issue.line}:`;
        summary += ` ${issue.message}\n`;
      }
      summary += `\n`;
    }
  }

  return summary;
}
