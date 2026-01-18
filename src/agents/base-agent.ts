import Anthropic from "@anthropic-ai/sdk";
import { MODELS, type ModelName } from "../models";
import type { PRInfo } from "../github";

export interface Issue {
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
  line?: number;
  file?: string;
  message: string;
  suggestion?: string;
}

export interface AgentReview {
  agentName: string;
  issues: Issue[];
  summary: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
}

export interface ReviewAgent {
  name: string;
  model: ModelName;
  focus: string;
  review(prInfo: PRInfo, context: string): Promise<AgentReview>;
}

export abstract class BaseAgent implements ReviewAgent {
  abstract name: string;
  abstract model: ModelName;
  abstract focus: string;

  constructor(protected anthropic: Anthropic) {}

  async review(prInfo: PRInfo, context: string): Promise<AgentReview> {
    const prompt = this.buildPrompt(prInfo, context);
    const modelConfig = MODELS[this.model];

    const response = await this.anthropic.messages.create({
      model: modelConfig.id,
      max_tokens: modelConfig.maxTokens,
      ...(modelConfig.thinking && {
        thinking: {
          type: "enabled",
          budget_tokens: modelConfig.thinking.budgetTokens,
        },
      }),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const reviewText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.type === "text" ? block.text : "")
      .join("\n");

    const issues = this.parseIssues(reviewText);

    return {
      agentName: this.name,
      issues,
      summary: this.extractSummary(reviewText),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cost: this.calculateCost(response.usage),
      },
    };
  }

  protected abstract buildPrompt(prInfo: PRInfo, context: string): string;

  protected parseIssues(reviewText: string): Issue[] {
    const issues: Issue[] = [];
    const issuePattern = /\[CONFIDENCE:\s*(\d+)\](?:\s*(?:Line\s+(\d+):?|File:\s*([^\n]+))?)?\s*(.+?)(?=\[CONFIDENCE:|$)/gs;

    let match;
    while ((match = issuePattern.exec(reviewText)) !== null) {
      const confidence = parseInt(match[1] || "0");
      const line = match[2] ? parseInt(match[2]) : undefined;
      const file = match[3] || undefined;
      const message = match[4]?.trim() || "";

      // Determine severity based on confidence
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

  protected calculateCost(usage: {
    input_tokens: number;
    output_tokens: number;
  }): number {
    const modelConfig = MODELS[this.model];
    const inputCost = (usage.input_tokens / 1_000_000) * modelConfig.pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * modelConfig.pricing.output;
    return inputCost + outputCost;
  }
}
