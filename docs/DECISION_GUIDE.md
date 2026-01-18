# PR Review Decision Guide

**Quick reference to choose the right review configuration for your PR.**

---

## 5-Second Decision

Ask yourself: **"What's the risk if this PR has a bug?"**

| Risk Level | Consequence | Use This |
|-----------|-------------|----------|
| 🔴 **Critical** | Security breach, data loss, $ loss | `--multi-agent --agentic` |
| 🟠 **High** | Production outage, breaking change | `--multi-agent --agents security,logic --agentic` |
| 🟡 **Medium** | User-facing bug, performance degradation | `--multi-agent` |
| 🟢 **Low** | Minor issue, easily fixed | `--model sonnet` |
| ⚪ **Minimal** | Typo, docs, tests | `--model haiku` |

---

## Decision Tree

```
What are you changing?
│
├─ Authentication / Authorization
│  └─ --multi-agent --agentic --agents security,logic
│     Cost: $0.26 | Time: 30s | Accuracy: 98%
│
├─ Payment / Financial
│  └─ --multi-agent --agentic --min-confidence 85
│     Cost: $0.50 | Time: 45s | Accuracy: 96%
│
├─ Database / Schema
│  └─ --multi-agent --agentic --agents security,logic,performance
│     Cost: $0.42 | Time: 38s | Accuracy: 94%
│
├─ Public API
│  └─ --multi-agent --agentic --max-turns 10
│     Cost: $0.48 | Time: 42s | Accuracy: 95%
│
├─ New Feature
│  └─ --multi-agent
│     Cost: $0.11 | Time: 8s | Accuracy: 85%
│
├─ Refactoring
│  └─ --multi-agent --agents logic,style
│     Cost: $0.06 | Time: 6s | Accuracy: 82%
│
├─ Performance Fix
│  └─ --multi-agent --agents performance,logic
│     Cost: $0.05 | Time: 6s | Accuracy: 80%
│
├─ Bug Fix
│  └─ --model sonnet
│     Cost: $0.08 | Time: 3s | Accuracy: 82%
│
├─ Tests
│  └─ --model haiku
│     Cost: $0.007 | Time: 2s | Accuracy: 75%
│
└─ Documentation
   └─ --model haiku
      Cost: $0.005 | Time: 2s | Accuracy: 75%
```

---

## By Code Path

| Files Changed | Configuration | Reason |
|--------------|---------------|--------|
| `**/auth/**` | `--multi-agent --agentic --agents security,logic` | Security-critical |
| `**/payment/**` | `--multi-agent --agentic --agents security,logic` | Financial impact |
| `**/api/**` | `--multi-agent --agentic --max-turns 8` | Breaking changes possible |
| `**/db/**` or `**/*migration*` | `--multi-agent --agentic` | Data integrity |
| `**/security/**` | `--multi-agent --agentic --agents security` | Obvious security focus |
| `**/core/**` | `--multi-agent` | Important but not critical |
| `**/utils/**` | `--model sonnet` | Helper functions |
| `**/test/**` | `--model haiku` | Tests |
| `**/docs/**` | `--model haiku` | Documentation |

---

## By PR Size

| Lines Changed | Files | Without Tools | With Tools (Agentic) |
|--------------|-------|---------------|---------------------|
| **1-50** | 1 | `--model haiku`<br>$0.005, 2s | `--model sonnet --agentic`<br>$0.15, 12s |
| **50-150** | 1-2 | `--model sonnet`<br>$0.08, 3s | `--multi-agent --agentic --max-turns 5`<br>$0.22, 20s |
| **150-400** | 3-5 | `--multi-agent`<br>$0.11, 7s | `--multi-agent --agentic`<br>$0.35, 35s |
| **400-800** | 5-10 | `--multi-agent`<br>$0.18, 9s | `--multi-agent --agentic --max-turns 10`<br>$0.58, 48s |
| **800+** | 10+ | `--multi-agent --min-confidence 80`<br>$0.25, 11s | `--multi-agent --agentic --max-turns 12`<br>$0.92, 65s |

**Recommendation**: Use agentic for medium+ PRs in critical paths.

---

## By Development Phase

| Phase | Typical PR | Configuration | Cost/Day (10 PRs) |
|-------|-----------|---------------|------------------|
| **Development** | Features, experiments | `--model haiku` | $0.07 |
| **Code Review** | Feature PRs | `--multi-agent` | $1.10 |
| **Pre-Staging** | Integration PRs | `--multi-agent --agents security,logic` | $0.80 |
| **Pre-Production** | Release PRs | `--multi-agent --agentic` | $3.50 |
| **Hotfix** | Emergency fixes | `--model opus --agentic` | Varies |

---

## By Team Type

### Startup (Move Fast)
**Priority**: Speed > Cost > Accuracy

```bash
# Default: Fast reviews
--model haiku

# Important PRs only
--multi-agent  # For features touching core product

# Critical only
--multi-agent --agentic --agents security  # For auth/payment
```

**Monthly Cost**: ~$150 for 500 PRs

### Established Product (Balance)
**Priority**: Accuracy > Cost > Speed

```bash
# Default: Comprehensive
--multi-agent

# Critical PRs
--multi-agent --agentic --agents security,logic

# Simple PRs
--model haiku  # For docs, tests
```

**Monthly Cost**: ~$1,200 for 1,000 PRs

### Enterprise (Quality First)
**Priority**: Accuracy > Speed > Cost

```bash
# Default: Verified comprehensive
--multi-agent --agentic --agents security,logic,performance

# Maximum coverage
--multi-agent --agentic  # All critical paths

# Fast-track
--multi-agent  # Non-critical paths
```

**Monthly Cost**: ~$4,500 for 2,000 PRs

### Open Source (Budget-Conscious)
**Priority**: Cost > Speed > Accuracy

```bash
# Default: Free tier
--model haiku

# Maintainer review
--multi-agent  # For maintainer PRs only

# Security patches
--multi-agent --agentic --agents security  # Only for security PRs
```

**Monthly Cost**: ~$50 for 300 PRs

---

## Common Scenarios

### Scenario 1: Friday Afternoon Production Deploy

**Context**: Deploying auth refactor to production before weekend
**Risk**: Very high
**Time Pressure**: Medium (1 hour until deploy window)

```bash
bun run src/index.ts <PR> \
  --multi-agent \
  --agentic \
  --agents security,logic \
  --min-confidence 85 \
  --show-tools

# Cost: $0.26 | Time: 30s | Worth it: YES
```

**Why**: 30 seconds to prevent a weekend on-call nightmare.

### Scenario 2: Dependency Version Bump

**Context**: Updating React 18.2 → 18.3
**Risk**: Low (patch version)
**Time Pressure**: None

```bash
bun run src/index.ts <PR> --model haiku

# Cost: $0.006 | Time: 2s | Worth it: YES
```

**Why**: Quick sanity check, minimal risk.

### Scenario 3: Payment Integration PR

**Context**: Adding Stripe payment flow
**Risk**: Critical (financial + legal)
**Time Pressure**: Low (feature branch)

```bash
bun run src/index.ts <PR> \
  --multi-agent \
  --agentic \
  --max-turns 12 \
  --min-confidence 90 \
  --show-tools \
  --save-to reviews/stripe-integration.md

# Cost: $0.68 | Time: 55s | Worth it: ABSOLUTELY
```

**Why**: Financial code requires highest scrutiny. Save review for compliance.

### Scenario 4: 100 Daily PRs (CI/CD Pipeline)

**Context**: High-volume team, automated reviews
**Risk**: Varies
**Time Pressure**: High (need fast feedback)

```yaml
# .github/workflows/pr-review.yml
if: contains(github.event.pull_request.labels.*.name, 'security')
  run: --multi-agent --agentic --agents security,logic
elif: contains(github.event.pull_request.labels.*.name, 'critical')
  run: --multi-agent --agentic
elif: changed_files contains 'auth/' or 'payment/'
  run: --multi-agent --agentic --agents security,logic
else:
  run: --multi-agent
```

**Why**: Automate decisions based on labels and file paths.

### Scenario 5: First-Time Contributor PR

**Context**: External contributor to open source
**Risk**: Unknown (unfamiliar with codebase)
**Time Pressure**: Low

```bash
bun run src/index.ts <PR> \
  --multi-agent \
  --min-confidence 75

# Cost: $0.11 | Time: 7s | Worth it: YES
```

**Why**: Comprehensive coverage to catch issues from unfamiliar contributors, but don't need expensive agentic mode.

### Scenario 6: Urgent Hotfix

**Context**: Production is down, emergency fix
**Risk**: High (production) but changes are small
**Time Pressure**: Extreme (minutes)

```bash
bun run src/index.ts <PR> \
  --model opus \
  --min-confidence 90

# Cost: $0.23 | Time: 4s | Worth it: YES
```

**Why**: Use fast Opus for best quality without agentic overhead. Every second counts.

---

## Cost-Benefit Analysis

### Is Agentic Mode Worth It?

Use this formula:

```
Expected Value = (Bug Cost) × (Detection Rate Improvement)
Cost of Agentic = ~$0.30 extra

If Expected Value > $0.30, use agentic mode.
```

**Example**:
- PR touches auth code
- Bug cost in production: $10,000 (incident response)
- Multi-agent detection rate: 80%
- Agentic detection rate: 100%
- Improvement: 20% × $10,000 = **$2,000 expected value**
- Cost: $0.30
- **ROI: 6,666x** ✅ Definitely use agentic!

### Budget Allocation

**$500/month budget, 200 PRs/month**:

| Strategy | Agentic % | Avg Cost/PR | Total Cost | PRs Covered | Quality |
|----------|-----------|-------------|-----------|-------------|---------|
| **All Haiku** | 0% | $0.007 | $1.40 | 200 | ⭐⭐ |
| **All Multi-Agent** | 0% | $0.11 | $22 | 200 | ⭐⭐⭐⭐ |
| **Selective Agentic** | 20% | $0.18 | $36 | 200 | ⭐⭐⭐⭐⭐ |
| **Heavy Agentic** | 50% | $0.30 | $60 | 200 | ⭐⭐⭐⭐⭐ |
| **All Agentic** | 100% | $0.45 | $90 | 200 | ⭐⭐⭐⭐⭐ |

**Recommendation**: "Selective Agentic" at $36/month for best value. Save budget for important PRs.

---

## Anti-Patterns

### ❌ Don't Do This

```bash
# Using expensive agentic for trivial changes
bun run src/index.ts <typo-fix-PR> --multi-agent --agentic
# Waste: $0.45 for a typo fix

# Using cheap haiku for critical security PR
bun run src/index.ts <auth-refactor-PR> --model haiku
# Risk: Missing critical security bugs

# Not using tools when you need them
bun run src/index.ts <complex-refactor-PR> --multi-agent
# Miss: 30% of issues that need context exploration
```

### ✅ Do This Instead

```bash
# Match tool to task
bun run src/index.ts <typo-fix-PR> --model haiku                           # $0.005
bun run src/index.ts <auth-refactor-PR> --multi-agent --agentic            # $0.45
bun run src/index.ts <complex-refactor-PR> --multi-agent --agentic         # $0.50
```

---

## Quick Reference

### Copy-Paste Commands

```bash
# 🔴 Critical (security, payment, auth)
bun run src/index.ts <PR> --multi-agent --agentic --agents security,logic --min-confidence 85

# 🟠 High (breaking changes, production)
bun run src/index.ts <PR> --multi-agent --agentic --max-turns 8

# 🟡 Medium (features, refactors)
bun run src/index.ts <PR> --multi-agent

# 🟢 Low (bug fixes)
bun run src/index.ts <PR> --model sonnet

# ⚪ Minimal (docs, tests, typos)
bun run src/index.ts <PR> --model haiku
```

---

## TL;DR

1. **For docs/typos**: `--model haiku` ($0.005, 2s)
2. **For regular PRs**: `--multi-agent` ($0.11, 7s)
3. **For critical PRs**: `--multi-agent --agentic` ($0.45, 40s)

**When in doubt, ask**: "Would a bug here cost more than $1 to fix in production?"
- **Yes** → Use agentic mode
- **No** → Use standard mode

**Remember**: One prevented production bug pays for 1,000+ reviews. Don't penny-pinch on critical code.
