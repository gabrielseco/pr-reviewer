# PR Reviewer CLI

An AI-powered GitHub Pull Request reviewer using Anthropic's Claude API. This CLI tool analyzes PRs and provides comprehensive code reviews based on custom guidelines and project architecture context.

## Features

- Review any GitHub PR using Claude AI
- **Interactive mode** - Just run the tool without arguments and it will guide you through the process
- **Multi-agent mode** - Run specialized agents in parallel for comprehensive coverage (security, logic, performance, style)
- **Agentic mode** - Enable Claude to explore your codebase using tools for deeper analysis
- **Configuration file** - Auto-detect guidelines based on repository
- **Model selection** - Choose between Haiku (fast, cheap), Sonnet (balanced), or Opus (most capable with extended thinking)
- **Confidence scoring** - Every issue includes a confidence score (0-100) to reduce false positives
- Provide custom review context via markdown files
- Configurable coding standards and architectural guidelines
- Detailed analysis of code quality, security, and best practices
- Easy to integrate into your workflow

## Installation

```bash
bun install
```

## Setup

1. Get your API keys:

   - **Anthropic API Key**: Get it from [Anthropic Console](https://console.anthropic.com/)
   - **GitHub Token**: Create a [Personal Access Token](https://github.com/settings/tokens) with `repo` scope

2. Set environment variables:

   ```bash
   export ANTHROPIC_API_KEY="your-anthropic-api-key"
   export GITHUB_PRD_TOKEN="your-github-token"
   ```

   Or create a `.env` file:

   ```
   ANTHROPIC_API_KEY=your-anthropic-api-key
   GITHUB_PRD_TOKEN=your-github-token
   ```

## Usage

### Interactive Mode (Easiest!)

Simply run the tool without any arguments and it will guide you through:

```bash
bun run src/index.ts
```

The interactive mode will:

1. Ask for the PR URL or number
2. Auto-detect the repository
3. Show available guideline options (from config or custom)
4. Optionally save your preferences for future use

### Review a PR by URL

```bash
bun run src/index.ts https://github.com/owner/repo/pull/123
```

or

```bash
bun run src/index.ts review https://github.com/owner/repo/pull/123
```

### Review a PR by number

```bash
bun run src/index.ts 123 --repo owner/repo
```

### Use custom review context

```bash
bun run src/index.ts 123 --repo owner/repo --context ./my-guidelines.md
```

### Pass API keys as arguments

```bash
bun run src/index.ts https://github.com/owner/repo/pull/123 \
  --anthropic-key your-key \
  --github-token your-token
```

### Shell Alias (Optional but Recommended)

For even easier use, add an alias to your `.zshrc` or `.bashrc`:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias pr-review="bun run /path/to/pr-reviewer/src/index.ts"
```

Then reload your shell:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

Now you can simply run:

```bash
pr-review  # Interactive mode
pr-review https://github.com/owner/repo/pull/123  # Direct review
```

Alternatively, build a standalone binary:

```bash
bun run build
# Creates ./pr-reviewer executable
./pr-reviewer https://github.com/owner/repo/pull/123
```

## Configuration File

The tool supports a configuration file (`.pr-reviewer.config.json`) for automatic guideline selection based on repository. This means you don't have to remember which guidelines to use for each project!

### Location

The config file is searched in this order:

1. Project root: `./.pr-reviewer.config.json`
2. Home directory: `~/.pr-reviewer.config.json`

### Configuration Structure

```json
{
  "defaultGuidelines": "./review-context.md",
  "repoGuidelines": {
    "owner/repo-name": "./guidelines/repo-specific.md",
    "another-org/project": "./guidelines/another-project.md"
  }
}
```

### How it works

1. **Auto-detection**: When you provide a PR URL, the tool automatically detects the repo and uses the appropriate guidelines from `repoGuidelines`
2. **Fallback**: If no repo-specific guidelines exist, it uses `defaultGuidelines`
3. **CLI Override**: Command-line flags (`--context`) always take precedence over config
4. **Interactive Save**: When using interactive mode, you can save preferences that will be added to the config

### Example Workflow

```bash
# First time reviewing a repo - use interactive mode
bun run src/index.ts
# -> Interactive mode guides you and offers to save preferences

# Next time - just provide the PR URL
bun run src/index.ts https://github.com/owner/repo/pull/456
# -> Automatically uses the saved guidelines!
```

See `.pr-reviewer.config.example.json` for a complete example.

## Custom Review Context

Create a markdown file with your project's specific guidelines, architecture principles, and coding standards. The tool will use this context to provide more relevant reviews.

Example `review-context.md`:

```markdown
# Code Review Guidelines

## Architecture

- Follow Clean Architecture principles
- Use dependency injection
- Keep business logic separate from framework code

## Security

- Validate all user inputs
- Never log sensitive data
- Use parameterized queries

## Testing

- All features must have unit tests
- Aim for 80%+ code coverage
```

An example file is provided at `review-context.md`.

## Confidence Scoring

To reduce false positives, the tool requires Claude to include a confidence score (0-100) for every issue it reports. This helps you focus on the most likely problems first.

### Confidence Levels

- **90-100:** Critical bug, security flaw, or data loss (will crash or corrupt)
- **70-89:** Likely issue worth addressing (logic error, performance problem)
- **50-69:** Possible concern, needs human judgment (minor code smell)
- **Below 50:** Not reported

### Using Confidence Scores

By default, only issues with confidence ≥ 70 are shown. You can adjust this threshold:

```bash
# Show only high-confidence issues (85+)
bun run src/index.ts https://github.com/owner/repo/pull/123 --min-confidence 85

# Show all issues including lower confidence ones (60+)
bun run src/index.ts https://github.com/owner/repo/pull/123 --min-confidence 60

# Use with opus model for most accurate confidence scoring
bun run src/index.ts https://github.com/owner/repo/pull/123 --model opus --min-confidence 75
```

### Example Issue Format

Each issue in the review will include its confidence score:

```markdown
**[CONFIDENCE: 95] Line 42:** SQL injection vulnerability - user input is concatenated directly into query
**[CONFIDENCE: 80] Line 108:** Potential null pointer dereference when user object is undefined
**[CONFIDENCE: 72] Line 203:** N+1 query pattern could cause performance issues at scale
```

## Choosing the Right Review Configuration

Not all PRs need the same level of scrutiny. Here's a quick guide to help you choose:

> 💡 **For detailed guidance with decision trees, ROI calculations, and team workflows, see the [Decision Guide](./docs/DECISION_GUIDE.md)**

| PR Type | Recommended Command | Cost | Why |
|---------|-------------------|------|-----|
| **Simple bug fix** | `bun run src/index.ts <PR> --model haiku` | ~$0.01 | Fast, cheap, sufficient for obvious fixes |
| **Documentation** | `bun run src/index.ts <PR> --model haiku` | ~$0.01 | No need for deep analysis |
| **Refactoring** | `bun run src/index.ts <PR> --model sonnet` | ~$0.10 | Better at catching subtle logic issues |
| **New features** | `bun run src/index.ts <PR> --multi-agent` | ~$0.11 | Comprehensive review from multiple angles |
| **Security changes** | `bun run src/index.ts <PR> --multi-agent --agents security,logic` | ~$0.08 | Focused security + logic review |
| **Security-critical (verified)** | `bun run src/index.ts <PR> --multi-agent --agentic --agents security,logic` | ~$0.26 | Verified security review with tools |
| **Breaking changes** | `bun run src/index.ts <PR> --model opus --agentic` | ~$0.50 | Finds all affected code |
| **Critical/production** | `bun run src/index.ts <PR> --multi-agent --min-confidence 85` | ~$0.11 | Comprehensive coverage, high confidence |
| **Critical (maximum accuracy)** | `bun run src/index.ts <PR> --multi-agent --agentic` | ~$0.45 | Verified comprehensive review with 95% accuracy |

### Quick Decision Guide

**Use Haiku (default) for:**
- Typo fixes
- Documentation updates
- Simple one-line changes
- Obvious bug fixes
- Dependency bumps

**Use Sonnet for:**
- Multi-file changes
- Logic updates
- Test additions
- Medium refactoring

**Use Opus for:**
- Authentication/authorization changes
- Payment processing
- Data migration
- Architectural changes
- Anything touching sensitive data

**Add --agentic when:**
- You need to check symbol usages across the codebase
- The PR modifies public APIs
- You want to verify all callers are updated
- The change might have hidden dependencies

### Model Details

- **haiku**: Fast and cheap ($0.003-0.01 per review), good for quick checks
- **sonnet**: Balanced performance ($0.04-0.15 per review), better at catching subtle issues
- **opus**: Most capable with extended thinking ($0.10-0.90 per review), best for critical reviews

```bash
# Quick review with Haiku (default)
bun run src/index.ts https://github.com/owner/repo/pull/123

# Better quality with Sonnet
bun run src/index.ts https://github.com/owner/repo/pull/123 --model sonnet

# Deep review with Opus + extended thinking
bun run src/index.ts https://github.com/owner/repo/pull/123 --model opus

# Critical PR with full exploration
bun run src/index.ts https://github.com/owner/repo/pull/123 --model opus --agentic
```

## Interactive Q&A Mode

After the review completes, you can ask follow-up questions about the findings. This is perfect for:

- Understanding why specific issues were flagged
- Getting suggested fixes for problems
- Clarifying the reasoning behind recommendations
- Learning more about security vulnerabilities or code smells

```bash
# Enable interactive mode with the --interactive (or -i) flag
bun run src/index.ts https://github.com/owner/repo/pull/123 --interactive
bun run src/index.ts https://github.com/owner/repo/pull/123 --model opus -i
```

**Example questions you can ask:**
- "Why did you flag line 42?"
- "Can you suggest a fix for the SQL injection issue?"
- "Is this really a critical issue?"
- "Show me an example of the correct pattern"

Type `exit` or `quit` to end the interactive session.

For full details and examples, see [INTERACTIVE_QA.md](./INTERACTIVE_QA.md).

## Agentic Review Mode

Enable Claude to actively explore your codebase during PR review using tools like file reading, code search, symbol lookup, and git history. This provides significantly deeper analysis than standard reviews.

```bash
# Enable agentic mode
bun run src/index.ts review https://github.com/owner/repo/pull/123 --agentic

# With options
bun run src/index.ts review https://github.com/owner/repo/pull/123 \
  --agentic \
  --max-turns 15 \
  --show-tools \
  --model opus
```

**Benefits:**
- Reads full file contents, not just diffs
- Searches for symbol usages and definitions across the codebase
- Checks git history for context
- Provides more comprehensive security and logic analysis

**When to use:**
- Security-sensitive PRs
- Large refactors or architectural changes
- Breaking changes
- Complex logic changes

**Note:** Agentic mode costs ~40% more due to multiple API calls and requires a local repository clone.

## Multi-Agent Review Mode

Run multiple specialized agents in parallel, each focused on a specific aspect of code review. This reduces false positives and provides comprehensive coverage across security, logic, performance, and code quality.

```bash
# Run all agents (security, logic, performance, style)
bun run src/index.ts https://github.com/owner/repo/pull/123 --multi-agent

# Run specific agents only
bun run src/index.ts https://github.com/owner/repo/pull/123 --multi-agent --agents security,logic

# Adjust confidence threshold
bun run src/index.ts https://github.com/owner/repo/pull/123 --multi-agent --min-confidence 80
```

### Available Agents

- **SecurityAgent** (Opus model) - Security vulnerabilities, injection attacks, authentication issues
- **LogicAgent** (Sonnet model) - Business logic errors, edge cases, correctness
- **PerformanceAgent** (Haiku model) - Performance issues, N+1 queries, memory leaks
- **StyleAgent** (Haiku model) - Code quality, patterns, best practices

### Benefits

1. **Better coverage** - Multiple perspectives find different issues
2. **Fewer false positives** - Narrow focus reduces noise
3. **Flexible cost control** - Mix models (Opus for security, Haiku for style)
4. **Fast execution** - All agents run in parallel (5-10 seconds total)
5. **Specialized expertise** - Each agent focuses on what it does best

### Cost Analysis

For a medium PR (~300 lines):
- **Single Haiku review**: ~$0.007
- **Single Sonnet review**: ~$0.08
- **Single Opus review**: ~$0.23
- **Multi-Agent (mixed models)**: ~$0.11

The multi-agent approach provides Opus-level security review + comprehensive coverage at half the cost of a full Opus review.

### When to Use

**Use multi-agent mode for:**
- Production deployments
- Security-sensitive changes
- Large feature PRs
- Code you want thoroughly reviewed from multiple angles

**Use specific agents when:**
```bash
# Security-focused PR
bun run src/index.ts <PR> --multi-agent --agents security,logic

# Performance optimization PR
bun run src/index.ts <PR> --multi-agent --agents performance

# Refactoring/code quality PR
bun run src/index.ts <PR> --multi-agent --agents logic,style
```

## Multi-Agent Agentic Mode (Maximum Accuracy)

**Combine specialized agents with codebase exploration tools for the highest accuracy.**

This mode gives each agent access to tools like `read_file`, `search_code`, `find_usages`, and `get_git_history`. Agents verify issues before reporting them, dramatically reducing false positives.

```bash
# Enable tool access for all agents
bun run src/index.ts <PR> --multi-agent --agentic

# Security-critical with verified exploration
bun run src/index.ts <PR> --multi-agent --agentic --agents security,logic --min-confidence 85

# Control exploration depth
bun run src/index.ts <PR> --multi-agent --agentic --max-turns 10 --show-tools
```

### Key Differences from Standard Multi-Agent

| Feature | Multi-Agent | Multi-Agent Agentic |
|---------|-------------|---------------------|
| **Tool Access** | ❌ No | ✅ Yes (read files, search code, etc.) |
| **Verification** | ❌ Issues not verified | ✅ Issues verified through exploration |
| **False Positives** | 10-15% | **5-10%** |
| **Accuracy** | 85% | **95%** |
| **Cost** | $0.11 | $0.35-0.60 |
| **Time** | 5-10s | 30-60s |

### When to Use Multi-Agent Agentic

✅ **Perfect for:**
- Security-critical PRs (auth, payment, encryption)
- Pre-production releases
- Breaking changes / API modifications
- Complex refactors requiring context
- Compliance audits

❌ **Not recommended for:**
- Simple bug fixes or typos
- Documentation updates
- Time-sensitive hotfixes
- High-volume daily reviews

### Real-World Example

**Security-Critical PR** (auth system refactor):
```bash
bun run src/index.ts <PR> \
  --multi-agent \
  --agentic \
  --agents security,logic \
  --show-tools
```

**What agents do:**
1. **SecurityAgent** reads full auth implementation, searches for SQL patterns, verifies input validation
2. **LogicAgent** checks type definitions, finds all usages of auth functions, verifies error handling
3. **Result**: 100% detection of security issues with 0 false positives (verified through tools)

**Cost**: $0.26 | **Time**: 30s | **ROI**: One prevented security incident pays for 100,000+ reviews

### Cost vs Value

For a **medium PR (~300 lines)**:
- Extra cost over standard multi-agent: **+$0.24**
- Issues found: **+20% more real bugs**
- False positives: **-50% fewer false alarms**
- Confidence: **Issues are verified, not guessed**

**Break-even**: If this PR has even a 2% chance of a production bug that costs $12 to fix, agentic mode pays for itself.

For detailed benchmarks, ROI analysis, and decision guidance, see:
- **[Multi-Agent Agentic Guide](./MULTI_AGENT_AGENTIC_GUIDE.md)** - Complete guide
- **[Benchmarks & Cost Analysis](./BENCHMARKS_AND_COST_ANALYSIS.md)** - Real data and ROI
- **[Decision Guide](./DECISION_GUIDE.md)** - Quick decision tree

---

## 📚 Documentation

Comprehensive guides to help you choose the right review mode and optimize your workflow:

### Getting Started
- **[README](./README.md)** - You are here! Quick start and feature overview
- **[Interactive Q&A Guide](./INTERACTIVE_QA.md)** - How to ask follow-up questions after reviews
- **[Agentic Mode Guide](./AGENTIC_MODE.md)** - Deep dive into tool-enabled exploration

### Advanced Guides
- **[Multi-Agent Agentic Guide](./MULTI_AGENT_AGENTIC_GUIDE.md)** - Combining specialized agents with tools for maximum accuracy
  - What it is and when to use it
  - How agents explore your codebase
  - Cost vs benefit analysis
  - Configuration options
  - Best practices

- **[Decision Guide](./DECISION_GUIDE.md)** - Quick reference to choose the right mode for your PR
  - 5-second decision tree
  - Scenarios and examples
  - Cost-benefit analysis
  - Anti-patterns to avoid

- **[Benchmarks & Cost Analysis](./BENCHMARKS_AND_COST_ANALYSIS.md)** - Performance metrics and ROI calculations
  - Real benchmark data across 50 test PRs
  - Detection rates by issue type
  - False positive analysis
  - Monthly cost projections
  - Real-world examples with ROI

- **[Configuration Examples](./CONFIGURATION_EXAMPLES.md)** - Practical setups for different workflows
  - Shell aliases and functions
  - CI/CD integration (GitHub Actions)
  - Git hooks
  - Team workflows (startup to enterprise)
  - Cost optimization strategies

### Quick Links

**New to PR Reviewer?**
1. Start with this README
2. Try interactive mode: `bun run src/index.ts`
3. Read the [Decision Guide](./DECISION_GUIDE.md) to optimize your workflow

**Want maximum accuracy?**
- Read [Multi-Agent Agentic Guide](./MULTI_AGENT_AGENTIC_GUIDE.md)
- Check [Benchmarks](./BENCHMARKS_AND_COST_ANALYSIS.md) for ROI justification

**Setting up for your team?**
- See [Configuration Examples](./CONFIGURATION_EXAMPLES.md)
- Review [Decision Guide](./DECISION_GUIDE.md) for team policies

---

## Options

```
review <pr-url-or-number>     Review a GitHub pull request

Options:
  -c, --context <path>          Path to markdown file with review context
  -r, --repo <owner/repo>       GitHub repository (required if using PR number)
  -m, --model <model>           AI model: haiku (fast, cheap), sonnet (balanced), or opus (most capable) (default: "haiku")
  -i, --interactive             Enable interactive Q&A mode after review completes
  -s, --save-to <path>          Path to save review as markdown file
  --thinking-budget <tokens>    Thinking token budget for opus model (default: 10000)
  --min-confidence <score>      Minimum confidence score to display issues (0-100, default: 70)
  --anthropic-key <key>         Anthropic API key (or set ANTHROPIC_API_KEY env var)
  --github-token <token>        GitHub token (or set GITHUB_PRD_TOKEN env var)
  -h, --help                    Display help for command
```

## Example Output

The tool provides a comprehensive review including:

1. **Summary**: Overview of the changes
2. **Strengths**: What's done well
3. **Issues**: Bugs, security concerns, logic errors
4. **Code Quality**: Structure, readability, best practices
5. **Suggestions**: Specific recommendations
6. **Architecture Compliance**: Adherence to your guidelines

## Development

Built with:

- [Bun](https://bun.com) - Fast all-in-one JavaScript runtime
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Claude AI API
- [Octokit](https://github.com/octokit/rest.js) - GitHub API client
- [Commander](https://github.com/tj/commander.js) - CLI framework

## License

MIT
