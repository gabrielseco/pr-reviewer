import Anthropic from "@anthropic-ai/sdk";
import { SecurityAgent } from "./agents/security-agent.js";
import { LogicAgent } from "./agents/logic-agent.js";
import { PerformanceAgent } from "./agents/performance-agent.js";
import { StyleAgent } from "./agents/style-agent.js";
import type { ReviewAgent, AgentReview, Issue } from "./agents/base-agent.js";
import type { PRInfo } from "./github.js";

export interface MultiAgentReviewResult {
  issues: Issue[];
  agentReviews: AgentReview[];
  summary: string;
  totalCost: number;
  timing: {
    total: number;
    perAgent: Record<string, number>;
  };
}

export interface MultiAgentOptions {
  agents?: string[]; // ["security", "logic", "performance", "style"]
  minConfidence?: number; // Default: 70
  parallelExecution?: boolean; // Default: true
}

export async function multiAgentReview(
  prInfo: PRInfo,
  context: string,
  anthropic: Anthropic,
  options: MultiAgentOptions = {}
): Promise<MultiAgentReviewResult> {
  const {
    agents: requestedAgents = ["security", "logic", "performance", "style"],
    minConfidence = 70,
    parallelExecution = true,
  } = options;

  // Initialize requested agents
  const allAgents: Record<string, ReviewAgent> = {
    security: new SecurityAgent(anthropic),
    logic: new LogicAgent(anthropic),
    performance: new PerformanceAgent(anthropic),
    style: new StyleAgent(anthropic),
  };

  const activeAgents = requestedAgents
    .map((name) => allAgents[name])
    .filter((agent) => agent !== undefined);

  if (activeAgents.length === 0) {
    throw new Error("No valid agents specified");
  }

  const startTime = Date.now();
  const perAgentTiming: Record<string, number> = {};

  // Run agents in parallel or sequentially
  let reviews: AgentReview[];
  if (parallelExecution) {
    reviews = await Promise.all(
      activeAgents.map(async (agent) => {
        const agentStart = Date.now();
        const review = await agent.review(prInfo, context);
        perAgentTiming[agent.name] = Date.now() - agentStart;
        return review;
      })
    );
  } else {
    reviews = [];
    for (const agent of activeAgents) {
      const agentStart = Date.now();
      const review = await agent.review(prInfo, context);
      perAgentTiming[agent.name] = Date.now() - agentStart;
      reviews.push(review);
    }
  }

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

  // Build summary
  const summary = buildAggregatedSummary(reviews, uniqueIssues);

  return {
    issues: uniqueIssues,
    agentReviews: reviews,
    summary,
    totalCost,
    timing: {
      total: Date.now() - startTime,
      perAgent: perAgentTiming,
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

function buildAggregatedSummary(
  reviews: AgentReview[],
  issues: Issue[]
): string {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;

  let summary = `# Multi-Agent Code Review\n\n`;
  summary += `**Agents**: ${reviews.map((r) => r.agentName).join(", ")}\n`;
  summary += `**Total Issues**: ${issues.length}`;

  if (criticalCount > 0) summary += ` (${criticalCount} critical`;
  if (highCount > 0) summary += `, ${highCount} high`;
  if (mediumCount > 0) summary += `, ${mediumCount} medium`;
  if (criticalCount > 0 || highCount > 0 || mediumCount > 0) summary += `)`;

  summary += `\n\n`;

  for (const review of reviews) {
    const agentIssues = issues.filter((i) =>
      review.issues.some((ri) => ri.message === i.message)
    );
    summary += `## ${review.agentName} Agent\n`;
    if (agentIssues.length === 0) {
      summary += `No issues found.\n\n`;
    } else {
      summary += `${agentIssues.length} issue(s)\n\n`;
    }
  }

  return summary;
}
