import path from "node:path";
import type { ToolExecutionResult } from "./types";

const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_SEARCH_LINES = 100;
const MAX_GIT_COMMITS = 20;

/**
 * Executes tools for agentic PR review with security validation
 */
export class ToolExecutor {
  constructor(private repoPath: string) {}

  /**
   * Main execution dispatcher
   */
  async executeTool(name: string, input: any): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      let result: string;

      switch (name) {
        case "read_file":
          result = await this.readFile(input.path);
          break;
        case "search_code":
          result = await this.searchCode(input.pattern, input.file_pattern);
          break;
        case "get_git_history":
          result = await this.getGitHistory(input.path, input.limit || 10);
          break;
        case "find_symbol_definition":
          result = await this.findSymbolDefinition(input.symbol, input.type);
          break;
        case "find_usages":
          result = await this.findUsages(input.symbol);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        success: true,
        result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Read a file from the repository
   */
  private async readFile(filePath: string): Promise<string> {
    const validatedPath = this.validatePath(filePath);
    const fullPath = path.join(this.repoPath, validatedPath);

    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${filePath}`);
    }

    const size = file.size;
    if (size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large (${Math.round(size / 1024)}KB). Maximum size is ${MAX_FILE_SIZE / 1024}KB.`
      );
    }

    const content = await file.text();
    return content;
  }

  /**
   * Search code using ripgrep or grep fallback
   */
  private async searchCode(
    pattern: string,
    filePattern?: string
  ): Promise<string> {
    // Try ripgrep first
    try {
      return await this.searchWithRipgrep(pattern, filePattern);
    } catch (error) {
      // If ripgrep fails, fall back to grep
      return await this.searchWithGrep(pattern, filePattern);
    }
  }

  /**
   * Search using ripgrep
   */
  private async searchWithRipgrep(
    pattern: string,
    filePattern?: string
  ): Promise<string> {
    const args = ["-n", "-i", pattern];

    if (filePattern) {
      args.push("-g", filePattern);
    }

    const proc = Bun.spawn(["rg", ...args], {
      cwd: this.repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    await proc.exited;

    if (proc.exitCode === 1) {
      return "No matches found.";
    }

    if (proc.exitCode !== 0 && proc.exitCode !== 1) {
      throw new Error(`ripgrep failed: ${error}`);
    }

    const lines = output.split("\n").filter((l) => l.trim());
    if (lines.length > MAX_SEARCH_LINES) {
      return (
        lines.slice(0, MAX_SEARCH_LINES).join("\n") +
        `\n\n... (${lines.length - MAX_SEARCH_LINES} more matches omitted. Refine your search pattern.)`
      );
    }

    return output || "No matches found.";
  }

  /**
   * Search using grep as fallback
   */
  private async searchWithGrep(
    pattern: string,
    filePattern?: string
  ): Promise<string> {
    // Build grep command
    const args = ["-r", "-n", "-i", "-E", pattern];

    // If file pattern is provided, use find to filter files
    if (filePattern) {
      // Convert glob pattern to find pattern
      const findPattern = filePattern.replace(/\*/g, "*");
      const findProc = Bun.spawn(
        ["find", ".", "-name", findPattern, "-type", "f"],
        {
          cwd: this.repoPath,
          stdout: "pipe",
        }
      );

      const files = await new Response(findProc.stdout).text();
      await findProc.exited;

      const fileList = files.split("\n").filter((f) => f.trim());

      if (fileList.length === 0) {
        return "No matching files found.";
      }

      // Search in specific files
      args.push(...fileList);
    } else {
      // Search in current directory
      args.push(".");
    }

    const proc = Bun.spawn(["grep", ...args], {
      cwd: this.repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 1) {
      return "No matches found.";
    }

    if (proc.exitCode !== 0 && proc.exitCode !== 1) {
      return "No matches found.";
    }

    const lines = output.split("\n").filter((l) => l.trim());
    if (lines.length > MAX_SEARCH_LINES) {
      return (
        lines.slice(0, MAX_SEARCH_LINES).join("\n") +
        `\n\n... (${lines.length - MAX_SEARCH_LINES} more matches omitted. Refine your search pattern.)`
      );
    }

    return output || "No matches found.";
  }

  /**
   * Get git history for a file or repository
   */
  private async getGitHistory(
    filePath?: string,
    limit: number = 10
  ): Promise<string> {
    const actualLimit = Math.min(limit, MAX_GIT_COMMITS);
    const args = ["log", `-n${actualLimit}`, "--oneline"];

    if (filePath) {
      const validatedPath = this.validatePath(filePath);
      args.push("--follow", "--", validatedPath);
    }

    const proc = Bun.spawn(["git", ...args], {
      cwd: this.repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();

    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`Git history failed: ${error}`);
    }

    return output || "No commit history found.";
  }

  /**
   * Find symbol definition
   */
  private async findSymbolDefinition(
    symbol: string,
    symbolType: string
  ): Promise<string> {
    let pattern: string;

    switch (symbolType) {
      case "function":
        pattern = `(function\\s+${symbol}|const\\s+${symbol}\\s*=|${symbol}\\s*\\([^)]*\\)\\s*{|${symbol}:\\s*\\([^)]*\\)\\s*=>)`;
        break;
      case "class":
        pattern = `class\\s+${symbol}`;
        break;
      case "interface":
        pattern = `interface\\s+${symbol}`;
        break;
      case "type":
        pattern = `type\\s+${symbol}`;
        break;
      case "any":
        pattern = `(class|interface|type|function|const)\\s+${symbol}`;
        break;
      default:
        pattern = symbol;
    }

    return this.searchCode(pattern);
  }

  /**
   * Find usages of a symbol
   */
  private async findUsages(symbol: string): Promise<string> {
    // Use word boundary to avoid partial matches
    const pattern = `\\b${symbol}\\b`;
    return this.searchCode(pattern);
  }

  /**
   * Validate and normalize file path to prevent directory traversal
   */
  private validatePath(filePath: string): string {
    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      throw new Error("Absolute paths are not allowed");
    }

    // Normalize the path
    const normalized = path.normalize(filePath);

    // Check for directory traversal
    if (normalized.includes("..")) {
      throw new Error("Directory traversal is not allowed");
    }

    return normalized;
  }
}
