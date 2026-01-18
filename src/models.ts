// Model configuration
export type ModelName = "haiku" | "sonnet" | "opus";

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

export interface ModelConfig {
  id: string;
  maxTokens: number;
  thinking?: ThinkingConfig;
  pricing: {
    input: number;
    output: number;
    thinking?: number; // Same as output for Opus
  };
}

export const MODELS: Record<ModelName, ModelConfig> = {
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
  opus: {
    id: "claude-opus-4-5-20251101",
    maxTokens: 16000,
    thinking: {
      enabled: true,
      budgetTokens: 10000, // "think harder" level
    },
    pricing: {
      input: 3.0, // per million tokens
      output: 15.0,
      thinking: 15.0, // Same as output
    },
  },
} as const;
