#!/usr/bin/env bun
/**
 * Quick verification test for agentic mode setup
 * This tests the tool executor without making API calls
 */

import { ToolExecutor } from "./src/agentic/tool-executor";
import { REVIEW_TOOLS } from "./src/agentic/tools";
import path from "path";

console.log("🔍 Testing agentic mode setup...\n");

// 1. Verify tool schemas are defined
console.log("✓ Tool schemas loaded:");
for (const tool of REVIEW_TOOLS) {
  console.log(`  - ${tool.name}: ${tool.description.substring(0, 60)}...`);
}
console.log();

// 2. Test ToolExecutor with local repository
const repoPath = process.cwd();
console.log(`✓ Using repository path: ${repoPath}\n`);

const executor = new ToolExecutor(repoPath);

// 3. Test read_file tool
console.log("Testing read_file tool...");
try {
  const result = await executor.executeTool("read_file", {
    path: "package.json",
  });
  if (result.success) {
    console.log(`✓ read_file works (${result.executionTimeMs}ms)`);
    console.log(`  File size: ${result.result?.length} characters`);
  } else {
    console.log(`✗ read_file failed: ${result.error}`);
  }
} catch (error) {
  console.log(`✗ read_file error: ${error}`);
}
console.log();

// 4. Test search_code tool
console.log("Testing search_code tool...");
try {
  const result = await executor.executeTool("search_code", {
    pattern: "import",
    file_pattern: "*.ts",
  });
  if (result.success) {
    console.log(`✓ search_code works (${result.executionTimeMs}ms)`);
    const lines = result.result?.split("\n").filter((l) => l.trim()).length || 0;
    console.log(`  Found ${lines} matching lines`);
  } else {
    console.log(`✗ search_code failed: ${result.error}`);
  }
} catch (error) {
  console.log(`✗ search_code error: ${error}`);
}
console.log();

// 5. Test get_git_history tool
console.log("Testing get_git_history tool...");
try {
  const result = await executor.executeTool("get_git_history", {
    limit: 5,
  });
  if (result.success) {
    console.log(`✓ get_git_history works (${result.executionTimeMs}ms)`);
    const commits = result.result?.split("\n").filter((l) => l.trim()).length || 0;
    console.log(`  Found ${commits} recent commits`);
  } else {
    console.log(`✗ get_git_history failed: ${result.error}`);
  }
} catch (error) {
  console.log(`✗ get_git_history error: ${error}`);
}
console.log();

// 6. Test find_usages tool
console.log("Testing find_usages tool...");
try {
  const result = await executor.executeTool("find_usages", {
    symbol: "reviewPR",
  });
  if (result.success) {
    console.log(`✓ find_usages works (${result.executionTimeMs}ms)`);
    const usages = result.result?.split("\n").filter((l) => l.trim()).length || 0;
    console.log(`  Found ${usages} usages of 'reviewPR'`);
  } else {
    console.log(`✗ find_usages failed: ${result.error}`);
  }
} catch (error) {
  console.log(`✗ find_usages error: ${error}`);
}
console.log();

// 7. Test find_symbol_definition tool
console.log("Testing find_symbol_definition tool...");
try {
  const result = await executor.executeTool("find_symbol_definition", {
    symbol: "ToolExecutor",
    type: "class",
  });
  if (result.success) {
    console.log(`✓ find_symbol_definition works (${result.executionTimeMs}ms)`);
    const definitions = result.result?.split("\n").filter((l) => l.trim()).length || 0;
    console.log(`  Found ${definitions} matching definitions`);
  } else {
    console.log(`✗ find_symbol_definition failed: ${result.error}`);
  }
} catch (error) {
  console.log(`✗ find_symbol_definition error: ${error}`);
}
console.log();

// 8. Test path validation (security)
console.log("Testing path validation (security)...");
try {
  const result = await executor.executeTool("read_file", {
    path: "../../../etc/passwd",
  });
  if (result.success) {
    console.log("✗ Path validation FAILED - directory traversal not blocked!");
  } else {
    console.log(`✓ Path validation works - blocked: ${result.error}`);
  }
} catch (error) {
  console.log(`✓ Path validation works - error caught: ${error}`);
}
console.log();

console.log("🎉 Agentic mode setup verification complete!\n");
console.log("To test with a real PR, run:");
console.log("  bun run src/index.ts review <PR-URL> --agentic --show-tools\n");
