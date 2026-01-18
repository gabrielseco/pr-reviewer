import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool definitions for agentic PR review
 */
export const REVIEW_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the full contents of a file from the repository. Use this to examine specific files in detail when you need to understand implementation details, check for issues, or verify changes.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The relative path to the file from the repository root (e.g., 'src/index.ts' or 'README.md')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_code",
    description:
      "Search for code patterns across the repository using regex. Useful for finding all usages of a function, checking for similar patterns, or identifying potential issues across multiple files.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description:
            "The regex pattern to search for (case-insensitive). Will match across all files unless file_pattern is specified.",
        },
        file_pattern: {
          type: "string",
          description:
            "Optional glob pattern to filter files (e.g., '*.ts', 'src/**/*.tsx'). If not specified, searches all files.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "get_git_history",
    description:
      "View the git commit history for a specific file or the entire repository. Useful for understanding how code evolved, who made changes, and the context of modifications.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Optional path to a specific file. If not provided, shows repository-wide history.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of commits to return (default: 10, max: 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "find_symbol_definition",
    description:
      "Find where a symbol (function, class, interface, or type) is defined in the codebase. Useful for understanding the original implementation or type definition.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The name of the symbol to find (e.g., 'UserAuth', 'processData')",
        },
        type: {
          type: "string",
          enum: ["function", "class", "interface", "type", "any"],
          description:
            "The type of symbol to search for. Use 'any' if uncertain about the type.",
        },
      },
      required: ["symbol", "type"],
    },
  },
  {
    name: "find_usages",
    description:
      "Find all usages of a symbol across the codebase. Useful for understanding the impact of changes, finding dependencies, or checking how a function/class is used.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The symbol name to search for usages of",
        },
      },
      required: ["symbol"],
    },
  },
];
