# Agentic Review Mode

## Overview

The agentic review feature enables Claude to explore your codebase using tools during PR review, providing deeper analysis and higher-quality feedback.

## Features

### Available Tools

Claude has access to 5 tools during agentic review:

1. **read_file** - Read full file contents
   - Useful for understanding complete implementations
   - Validates file paths for security
   - Max file size: 50KB

2. **search_code** - Search for patterns across the codebase
   - Uses ripgrep (with grep fallback)
   - Case-insensitive regex matching
   - Supports file pattern filtering
   - Limited to 100 lines per result

3. **get_git_history** - View commit history
   - Shows repository or file-specific history
   - Max 20 commits per query
   - Helps understand code evolution

4. **find_symbol_definition** - Locate symbol definitions
   - Finds functions, classes, interfaces, types
   - Smart pattern matching based on symbol type

5. **find_usages** - Find all symbol usages
   - Word boundary matching
   - Helps assess change impact

## Usage

### Basic Usage

```bash
bun run src/index.ts review <PR-URL> --agentic
```

### With Options

```bash
bun run src/index.ts review <PR-URL> \
  --agentic \
  --max-turns 15 \
  --show-tools \
  --model opus \
  --repo-path /path/to/local/repo
```

### CLI Flags

- `--agentic` - Enable agentic mode
- `--max-turns <number>` - Maximum turns (1-30, default: 10)
- `--show-tools` - Display tool usage during review
- `--repo-path <path>` - Local repository path (defaults to cwd)

## Architecture

### Directory Structure

```
src/agentic/
├── types.ts              # TypeScript interfaces
├── tools.ts              # Tool schema definitions
├── tool-executor.ts      # Tool execution & validation
└── agentic-reviewer.ts   # Multi-turn review loop
```

### How It Works

1. User runs review with `--agentic` flag
2. Claude receives PR diff and tool descriptions
3. Claude analyzes and decides which tools to use
4. Tools execute in local repository (read-only)
5. Claude receives tool results and continues analysis
6. Process repeats up to `max-turns` or until completion
7. Final review is displayed with tool usage stats

### Security

- **Read-only operations** - No code modification
- **Path validation** - Blocks directory traversal attacks
- **Size limits** - Prevents context window overflow
- **Sandboxed execution** - Tools run in isolated processes

## Example Session

```bash
$ bun run src/index.ts review https://github.com/owner/repo/pull/123 \
    --agentic --show-tools --model opus

Fetching PR information from GitHub
✓ Fetched PR from GitHub (1.23s)

📝 PR: Add user authentication middleware
📦 Repository: owner/repo
📄 Files changed: 3

🔄 Turn 1/10
⠋ Using read_file: src/middleware/auth.ts
✓ read_file: src/middleware/auth.ts (125ms)

🔄 Turn 2/10
⠋ Using search_code: 'authenticateUser' in *.ts
✓ search_code: 'authenticateUser' in *.ts (87ms)
⠋ Using find_usages: 'jwtSecret'
✓ find_usages: 'jwtSecret' (45ms)

✓ Agent completed exploration

✓ Completed agentic review in 2 turns (5.21s)

📊 Tool Usage:
   read_file: 1 calls (125ms total)
   search_code: 1 calls (87ms total)
   find_usages: 1 calls (45ms total)

================================================================================
CODE REVIEW
================================================================================

[Review content here with enhanced insights from tool exploration...]

================================================================================

📊 Review Statistics:
   Model: opus (claude-opus-4-5-20251101)
   Mode: agentic (2 turns)
   Confidence threshold: 70%
   GitHub API time: 1.23s
   Total time: 6.44s

✨ Review complete!
```

## Benefits

### vs. Single-Pass Review

| Feature | Single-Pass | Agentic |
|---------|------------|---------|
| Sees full files | ❌ Only diff | ✅ Can read files |
| Searches codebase | ❌ No | ✅ Yes |
| Checks usages | ❌ Limited | ✅ Complete |
| Git history | ❌ No | ✅ Yes |
| Cost | Lower | ~40% higher |
| Quality | Good | Excellent |

### When to Use Agentic Mode

**Best for:**
- Security-sensitive PRs
- Large refactors
- Architectural changes
- Breaking changes
- Complex logic changes

**Skip for:**
- Documentation changes
- Simple bug fixes
- Typo corrections
- Trivial updates

## Cost Considerations

Agentic mode costs ~40% more due to:
- Multiple API calls (up to max-turns)
- Tool result context
- Larger conversation history

**Recommendations:**
- Use Sonnet for most reviews (balanced cost/quality)
- Reserve Opus for critical PRs
- Set appropriate `--max-turns` (default: 10)
- Use `--min-confidence` to filter noise

## Performance

### Typical Turn Counts

- Small PRs (1-2 files): 3-5 turns
- Medium PRs (5-10 files): 5-8 turns
- Large PRs (10+ files): 8-12 turns

### Tool Execution Speed

- `read_file`: <10ms (local disk)
- `search_code`: 50-200ms (ripgrep is fast)
- `get_git_history`: 10-50ms
- `find_symbol_definition`: 50-200ms
- `find_usages`: 50-200ms

## Limitations

1. **Requires local repository clone**
   - Tools need filesystem access
   - GitHub API doesn't provide full file contents easily

2. **File size limits**
   - 50KB per file (prevents context overflow)
   - 100 lines per search result

3. **Max turns limit**
   - Prevents runaway costs
   - Default: 10, Max: 30

4. **Read-only**
   - Can't run tests (future feature)
   - Can't modify code

## Troubleshooting

### "Executable not found: rg"

Install ripgrep:
```bash
brew install ripgrep
```

The tool has grep fallback, but ripgrep is much faster.

### "Directory traversal is not allowed"

This is a security feature. The tool only allows relative paths within the repository.

### "Reached maximum turns"

The review may be incomplete. Try:
- Increase `--max-turns` (e.g., `--max-turns 20`)
- Use a more capable model (`--model opus`)
- Review smaller PRs

### Token usage tracking shows N/A

Agentic mode doesn't currently track exact token usage across all turns. Use `--show-tools` for detailed execution info.

## Interactive Mode Compatibility

Agentic mode works seamlessly with interactive Q&A:

```bash
bun run src/index.ts review <PR-URL> --agentic --interactive
```

After the agentic review completes, you can ask follow-up questions. Claude retains the full conversation history including all tool usage.

## Future Enhancements

Potential improvements:
- Run test suites as a tool
- Lint checking integration
- Code coverage analysis
- Performance profiling
- Multi-file refactoring suggestions
- Automatic fix generation

## Testing

Run the verification test:

```bash
bun run test-agentic-setup.ts
```

This tests all tools without making API calls.

## Questions?

- Check the main README.md for general usage
- Review PR_REVIEWER_IMPROVEMENT_PLAN.md for architectural details
- See src/agentic/ for implementation code
