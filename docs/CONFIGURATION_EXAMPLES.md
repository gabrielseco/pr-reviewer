# Configuration Examples

**Practical configuration examples for different use cases and team setups.**

---

## Table of Contents

1. [Shell Aliases](#shell-aliases)
2. [CI/CD Integration](#cicd-integration)
3. [Git Hooks](#git-hooks)
4. [Team Workflows](#team-workflows)
5. [Cost Optimization](#cost-optimization)

---

## Shell Aliases

### Basic Aliases

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# Quick access
alias pr="bun run /path/to/pr-reviewer/src/index.ts"

# Mode shortcuts
alias pr-quick="pr --model haiku"
alias pr-standard="pr --model sonnet"
alias pr-deep="pr --model opus"
alias pr-multi="pr --multi-agent"
alias pr-agentic="pr --multi-agent --agentic"

# Use cases
alias pr-security="pr --multi-agent --agentic --agents security,logic --min-confidence 85"
alias pr-perf="pr --multi-agent --agents performance,logic"
alias pr-critical="pr --multi-agent --agentic --show-tools --save-to review.md"
```

**Usage**:
```bash
pr-quick 123 --repo owner/repo         # Fast review
pr-security https://github.com/...     # Security-focused
pr-critical 456 --repo owner/repo      # Critical PR with full logging
```

### Advanced Aliases with Functions

```bash
# Smart PR review based on file patterns
pr-smart() {
  local pr_url=$1
  local changed_files=$(gh pr view $pr_url --json files -q '.files[].path')

  if echo "$changed_files" | grep -q "auth\|payment\|security"; then
    echo "🔒 Security-critical files detected, using agentic mode..."
    pr "$pr_url" --multi-agent --agentic --agents security,logic
  elif echo "$changed_files" | grep -q "\.md$\|docs/"; then
    echo "📝 Documentation changes, using haiku..."
    pr "$pr_url" --model haiku
  else
    echo "📊 Standard review with multi-agent..."
    pr "$pr_url" --multi-agent
  fi
}

# Review with automatic label detection
pr-auto() {
  local pr_url=$1
  local labels=$(gh pr view $pr_url --json labels -q '.labels[].name')

  if echo "$labels" | grep -q "critical\|security"; then
    pr "$pr_url" --multi-agent --agentic --min-confidence 90
  elif echo "$labels" | grep -q "feature"; then
    pr "$pr_url" --multi-agent
  else
    pr "$pr_url" --model sonnet
  fi
}
```

---

## CI/CD Integration

### GitHub Actions

#### Basic Setup

`.github/workflows/pr-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install PR Reviewer
        run: |
          git clone https://github.com/yourusername/pr-reviewer.git
          cd pr-reviewer
          bun install

      - name: Run Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_PRD_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd pr-reviewer
          bun run src/index.ts ${{ github.event.pull_request.html_url }} \
            --multi-agent \
            --min-confidence 75 \
            --save-to review.md

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('pr-reviewer/review.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: review
            });
```

#### Advanced Setup with Path-Based Rules

```yaml
name: Smart AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Get changed files
        id: changed-files
        uses: tj-actions/changed-files@v41

      - name: Determine review mode
        id: review-mode
        run: |
          CHANGED_FILES="${{ steps.changed-files.outputs.all_changed_files }}"

          # Check for security-critical files
          if echo "$CHANGED_FILES" | grep -qE "auth|payment|security|crypto"; then
            echo "mode=--multi-agent --agentic --agents security,logic --min-confidence 85" >> $GITHUB_OUTPUT
            echo "label=🔒 Security Review" >> $GITHUB_OUTPUT

          # Check for API changes
          elif echo "$CHANGED_FILES" | grep -qE "api/|routes/|endpoints/"; then
            echo "mode=--multi-agent --agentic --max-turns 8" >> $GITHUB_OUTPUT
            echo "label=🌐 API Review" >> $GITHUB_OUTPUT

          # Check for database changes
          elif echo "$CHANGED_FILES" | grep -qE "migration|schema|db/"; then
            echo "mode=--multi-agent --agentic --agents security,logic,performance" >> $GITHUB_OUTPUT
            echo "label=🗄️ Database Review" >> $GITHUB_OUTPUT

          # Check for docs only
          elif echo "$CHANGED_FILES" | grep -qE "\.md$|docs/"; then
            echo "mode=--model haiku" >> $GITHUB_OUTPUT
            echo "label=📝 Quick Review" >> $GITHUB_OUTPUT

          # Default: comprehensive
          else
            echo "mode=--multi-agent" >> $GITHUB_OUTPUT
            echo "label=📊 Standard Review" >> $GITHUB_OUTPUT
          fi

      - name: Install PR Reviewer
        run: |
          git clone https://github.com/yourusername/pr-reviewer.git
          cd pr-reviewer
          bun install

      - name: Run AI Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_PRD_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd pr-reviewer
          echo "Running: ${{ steps.review-mode.outputs.label }}"
          bun run src/index.ts ${{ github.event.pull_request.html_url }} \
            ${{ steps.review-mode.outputs.mode }} \
            --save-to review.md

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('pr-reviewer/review.md', 'utf8');
            const label = "${{ steps.review-mode.outputs.label }}";

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## ${label}\n\n${review}`
            });
```

#### Label-Based Routing

```yaml
name: Label-Based Review

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Determine review config
        id: config
        run: |
          LABELS="${{ join(github.event.pull_request.labels.*.name, ',') }}"

          if [[ "$LABELS" == *"critical"* ]] || [[ "$LABELS" == *"security"* ]]; then
            echo "mode=--multi-agent --agentic --min-confidence 90" >> $GITHUB_OUTPUT
          elif [[ "$LABELS" == *"feature"* ]]; then
            echo "mode=--multi-agent" >> $GITHUB_OUTPUT
          elif [[ "$LABELS" == *"hotfix"* ]]; then
            echo "mode=--model opus" >> $GITHUB_OUTPUT
          else
            echo "mode=--model sonnet" >> $GITHUB_OUTPUT
          fi

      # ... rest of workflow
```

---

## Git Hooks

### Pre-Push Hook

`.git/hooks/pre-push`:

```bash
#!/bin/bash

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Skip for main/master
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  exit 0
fi

# Check if there's a PR for this branch
PR_URL=$(gh pr view --json url -q .url 2>/dev/null)

if [ -n "$PR_URL" ]; then
  echo "🤖 Running AI review on PR before push..."

  # Quick review
  bun run /path/to/pr-reviewer/src/index.ts "$PR_URL" \
    --model sonnet \
    --min-confidence 80

  if [ $? -ne 0 ]; then
    echo "❌ AI review found critical issues. Fix before pushing."
    exit 1
  fi

  echo "✅ AI review passed"
fi

exit 0
```

Make it executable:
```bash
chmod +x .git/hooks/pre-push
```

### Pre-Commit Hook (Local Review)

`.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Only run on certain file types
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|tsx|jsx)$')

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

# Check if files touch security-critical paths
SECURITY_FILES=$(echo "$CHANGED_FILES" | grep -E 'auth|payment|security')

if [ -n "$SECURITY_FILES" ]; then
  echo "⚠️  Security-critical files detected:"
  echo "$SECURITY_FILES"
  echo ""
  echo "Remember to run a full security review before merge:"
  echo "  pr-security <PR-URL>"
  echo ""
fi

exit 0
```

---

## Team Workflows

### Startup Team (5 devs, 50 PRs/day)

**Goal**: Fast iteration, minimal cost

```bash
# .pr-reviewer.config.json (team shared config)
{
  "defaultMode": "haiku",
  "rules": [
    {
      "paths": ["**/auth/**", "**/payment/**"],
      "mode": "multi-agent-agentic",
      "agents": ["security", "logic"],
      "minConfidence": 90
    },
    {
      "labels": ["critical"],
      "mode": "multi-agent-agentic"
    },
    {
      "paths": ["**/docs/**", "**/*.md"],
      "mode": "haiku"
    }
  ]
}

# Team aliases
alias pr-review="pr --multi-agent"           # Use for features
alias pr-fast="pr --model haiku"             # Use for fixes
alias pr-sec="pr-security"                   # Use for auth/payment
```

**Expected monthly cost**: ~$200 for 1,000 PRs

### Mid-Size Team (20 devs, 200 PRs/day)

**Goal**: Balance quality and speed

```yaml
# .github/workflows/pr-review.yml
# Automated review on every PR

# Team policy:
# - All PRs: Standard multi-agent review
# - Security paths: Agentic security review
# - Pre-release: Full agentic review

stages:
  - name: Standard Review
    if: always
    run: --multi-agent --min-confidence 75

  - name: Security Review
    if: changed_files contains 'auth' or 'payment'
    run: --multi-agent --agentic --agents security,logic

  - name: Pre-Release Review
    if: base_branch == 'release'
    run: --multi-agent --agentic --min-confidence 85
```

**Expected monthly cost**: ~$2,500 for 4,000 PRs

### Enterprise Team (100+ devs)

**Goal**: Maximum quality, comprehensive coverage

```yaml
# Tiered review system
tier-1:  # Critical paths
  paths: ["**/auth/**", "**/payment/**", "**/security/**"]
  review: --multi-agent --agentic --min-confidence 90 --show-tools --save-to reviews/

tier-2:  # Important paths
  paths: ["**/api/**", "**/db/**", "**/core/**"]
  review: --multi-agent --agentic --agents security,logic,performance

tier-3:  # Standard paths
  paths: ["**/features/**", "**/components/**"]
  review: --multi-agent --min-confidence 75

tier-4:  # Low-risk
  paths: ["**/utils/**", "**/helpers/**"]
  review: --model sonnet

tier-5:  # Minimal
  paths: ["**/test/**", "**/docs/**", "**/*.md"]
  review: --model haiku
```

**Expected monthly cost**: ~$12,000 for 20,000 PRs

---

## Cost Optimization

### Strategy 1: Time-Based Routing

Review critical PRs thoroughly during business hours, quick reviews after hours:

```bash
#!/bin/bash

HOUR=$(date +%H)

if [ $HOUR -ge 9 ] && [ $HOUR -le 17 ]; then
  # Business hours: comprehensive
  MODE="--multi-agent"
else
  # After hours: fast
  MODE="--model haiku"
fi

pr $1 $MODE
```

### Strategy 2: Size-Based Routing

```bash
#!/bin/bash

PR_URL=$1
LINES_CHANGED=$(gh pr view $PR_URL --json additions,deletions -q '.additions + .deletions')

if [ $LINES_CHANGED -lt 50 ]; then
  MODE="--model haiku"
elif [ $LINES_CHANGED -lt 300 ]; then
  MODE="--multi-agent"
else
  MODE="--multi-agent --agentic --max-turns 8"
fi

pr $PR_URL $MODE
```

### Strategy 3: Author-Based Routing

```bash
#!/bin/bash

PR_URL=$1
AUTHOR=$(gh pr view $PR_URL --json author -q '.author.login')

# Trusted senior devs get quick reviews
SENIOR_DEVS=("alice" "bob" "charlie")

if [[ " ${SENIOR_DEVS[@]} " =~ " ${AUTHOR} " ]]; then
  MODE="--model sonnet"
else
  # External/junior devs get comprehensive review
  MODE="--multi-agent"
fi

pr $PR_URL $MODE
```

### Strategy 4: Budget-Aware Routing

Track monthly spend and adjust:

```bash
#!/bin/bash

# Track spend in file
SPEND_FILE=~/.pr-reviewer-spend
CURRENT_SPEND=$(cat $SPEND_FILE 2>/dev/null || echo "0")
BUDGET_LIMIT=500  # $500/month

if (( $(echo "$CURRENT_SPEND < $BUDGET_LIMIT" | bc -l) )); then
  # Under budget: use comprehensive reviews
  MODE="--multi-agent"
else
  # Over budget: use cheaper mode
  MODE="--model haiku"
  echo "⚠️  Monthly budget exceeded, using fast mode"
fi

# Run review and track cost
COST=$(pr $1 $MODE --show-cost | grep "Cost:" | awk '{print $2}')
NEW_SPEND=$(echo "$CURRENT_SPEND + $COST" | bc)
echo $NEW_SPEND > $SPEND_FILE

pr $1 $MODE
```

---

## Interactive Workflows

### Review + Fix Workflow

```bash
#!/bin/bash

PR_URL=$1

# Run comprehensive review
echo "🔍 Running comprehensive review..."
pr $PR_URL --multi-agent --agentic --interactive --save-to review.md

# Parse critical issues
CRITICAL_COUNT=$(grep -c "CONFIDENCE: 9[0-9]" review.md)

if [ $CRITICAL_COUNT -gt 0 ]; then
  echo ""
  echo "⚠️  Found $CRITICAL_COUNT critical issues!"
  echo "Review saved to review.md"
  echo ""
  echo "Recommended actions:"
  echo "1. Read review.md"
  echo "2. Fix critical issues"
  echo "3. Re-run: pr $PR_URL --multi-agent"
fi
```

### Team Review Workflow

```bash
#!/bin/bash

# .team/review-workflow.sh

PR_URL=$1
REVIEWER=$2  # Team member doing review

echo "👤 Reviewer: $REVIEWER"
echo "🔗 PR: $PR_URL"
echo ""

# Run appropriate review based on PR type
echo "🤖 Running AI pre-review..."
pr $PR_URL --multi-agent --save-to "reviews/pr-$(date +%Y%m%d-%H%M%S).md"

echo ""
echo "✅ AI review complete. Next steps:"
echo "1. Review the AI findings"
echo "2. Add your human insights"
echo "3. Submit your review on GitHub"
```

---

## Example Shell Scripts

### All-in-One Review Script

`~/bin/pr-review`:

```bash
#!/bin/bash

set -e

# Usage: pr-review <pr-url-or-number> [options]

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PR_INPUT=$1
shift  # Remove first argument, rest are options

# Detect PR URL or number
if [[ $PR_INPUT =~ ^https:// ]]; then
  PR_URL=$PR_INPUT
else
  # PR number, need repo
  if [ -z "$GITHUB_REPOSITORY" ]; then
    # Try to get from git remote
    REPO=$(git remote get-url origin | sed -E 's/.*github.com[:/](.+)\.git/\1/')
    PR_URL="https://github.com/$REPO/pull/$PR_INPUT"
  else
    PR_URL="https://github.com/$GITHUB_REPOSITORY/pull/$PR_INPUT"
  fi
fi

echo -e "${GREEN}🤖 PR Review Assistant${NC}"
echo -e "📝 Reviewing: $PR_URL"
echo ""

# Get PR info
echo "Fetching PR details..."
PR_TITLE=$(gh pr view $PR_URL --json title -q .title)
FILES_CHANGED=$(gh pr view $PR_URL --json files -q '.files | length')
LINES=$(gh pr view $PR_URL --json additions,deletions -q '.additions + .deletions')

echo -e "  ${YELLOW}Title:${NC} $PR_TITLE"
echo -e "  ${YELLOW}Files:${NC} $FILES_CHANGED changed"
echo -e "  ${YELLOW}Lines:${NC} $LINES modified"
echo ""

# Determine mode
if [ -z "$1" ]; then
  # Auto-detect mode
  if [ $LINES -lt 50 ]; then
    MODE="--model haiku"
    COST_EST="~\$0.01"
  elif [ $LINES -lt 300 ]; then
    MODE="--multi-agent"
    COST_EST="~\$0.11"
  else
    MODE="--multi-agent --agentic --max-turns 8"
    COST_EST="~\$0.50"
  fi

  echo -e "${YELLOW}Auto-selected mode:${NC} $MODE"
  echo -e "${YELLOW}Estimated cost:${NC} $COST_EST"
  echo ""

  # Ask for confirmation
  read -p "Proceed? [Y/n] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ ! -z $REPLY ]]; then
    echo "Cancelled"
    exit 1
  fi
else
  MODE="$@"
fi

# Run review
echo "Running review..."
bun run /path/to/pr-reviewer/src/index.ts $PR_URL $MODE

echo ""
echo -e "${GREEN}✅ Review complete${NC}"
```

Make it executable and add to PATH:
```bash
chmod +x ~/bin/pr-review
export PATH="$HOME/bin:$PATH"  # Add to ~/.zshrc
```

Usage:
```bash
pr-review https://github.com/owner/repo/pull/123
pr-review 123  # Auto-detect repo from git remote
pr-review 123 --multi-agent --agentic  # Custom mode
```

---

## Quick Reference

### Common Commands

```bash
# Quick review
pr <PR> --model haiku

# Standard comprehensive review
pr <PR> --multi-agent

# Security-critical review
pr <PR> --multi-agent --agentic --agents security,logic --min-confidence 85

# Full exploration
pr <PR> --multi-agent --agentic --show-tools --save-to review.md

# Interactive mode (ask questions after review)
pr <PR> --multi-agent --interactive

# Custom confidence threshold
pr <PR> --multi-agent --min-confidence 90
```

### GitHub CLI Integration

```bash
# Review current branch's PR
gh pr view --json url -q .url | xargs pr --multi-agent

# Review and approve if no critical issues
pr $(gh pr view --json url -q .url) --min-confidence 90 && gh pr review --approve

# Review all open PRs (be careful with costs!)
gh pr list --json url -q .[].url | while read url; do pr $url --model haiku; done
```

---

## Best Practices

1. **Start Conservative**: Use haiku/sonnet by default, agentic for critical paths only
2. **Track Costs**: Monitor your monthly spend to stay within budget
3. **Automate Wisely**: Use CI/CD for consistent reviews, but allow manual override
4. **Save Important Reviews**: Use `--save-to` for critical PRs to create audit trail
5. **Iterate**: Adjust your configs based on what works for your team

---

For more examples and patterns, see:
- [Decision Guide](./DECISION_GUIDE.md)
- [Multi-Agent Agentic Guide](./MULTI_AGENT_AGENTIC_GUIDE.md)
- [Benchmarks and Cost Analysis](./BENCHMARKS_AND_COST_ANALYSIS.md)
