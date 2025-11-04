# Phased Approach: Improving PR Review Quality

## Problem Statement

Current PR reviews are not meeting quality expectations. Root cause analysis shows:

1. **Prompt ordering is backwards** - Guidelines appear before code (lines 253-260), then diff (lines 263-267)
2. **Type safety issues** - Multiple `any` types (lines 163, 231, 234)
3. **Magic values** - Model name and pricing hardcoded throughout
4. **Using Haiku model** - Fast but less capable than Sonnet

## Philosophy

> **Fix the biggest problems first, measure results, iterate.**

Instead of a massive refactor, take a phased approach targeting high-impact changes.

---

## Phase 1: High Impact, Low Effort ⭐⭐⭐⭐⭐

**Goal:** Fix critical issues that directly affect review quality

### Changes

#### 1. Fix Type Safety (Easy Win)

- **Lines affected:** 163, 231, 234
- **Change:** Import `PRInfo` from `./github.ts`, replace all `any` types
- **Benefit:** Type safety, better IDE support, zero runtime impact
- **Effort:** 5 minutes

#### 2. Reorder Prompt (Critical Fix) 🎯

- **Lines affected:** 231-287 (buildReviewPrompt function)
- **Current order:**
  ```
 1. Header
 2. PR Info
 3. Files Changed
 4. Guidelines ← TOO EARLY
 5. Diff
 6. Instructions
  ```

- **New order:**
  ```
 1. Header
 2. PR Info
 3. Files Changed
 4. Diff ← SHOW CODE FIRST
 5. Guidelines ← THEN APPLY RULES
 6. Instructions (reference guidelines if provided)
  ```

- **Benefit:** Claude sees code in context, then applies rules = better reviews
- **Effort:** 10 minutes

#### 3. Extract Constants

- **Add constants section at top of file:**
  ```typescript
  // Model configuration
  const MODEL = "claude-haiku-4-5-20251001" as const;
  const MAX_TOKENS = 4000;
  
  // Pricing (per million tokens)
  const PRICING = {
    input: 0.25,
    output: 1.25,
  } as const;
  ```

- **Lines affected:** 70, 71, 89, 90
- **Benefit:** Easy to update when prices/models change, single source of truth
- **Effort:** 5 minutes

#### 4. Enhance Prompt Instructions

- **Make instructions more specific and actionable**
- **When guidelines provided:** Explicitly tell Claude to check compliance with guideline areas
- **Add:** "Focus on architectural decisions mentioned in guidelines"
- **Effort:** 5 minutes

**Total Effort:** ~25 minutes

**Expected Impact:** Significant improvement in review quality

**Success Metrics:**

- Reviews mention specific guideline violations/compliance
- Reviews show understanding of code context before applying rules
- Type errors eliminated (TypeScript compilation)

---

## Phase 2: Model Upgrade (If Phase 1 Isn't Enough)

**Goal:** Better reviews through more capable model

**Trigger:** If Phase 1 improves reviews but they're still not detailed enough

### Changes

#### 1. Upgrade Model: Haiku → Sonnet

- **Change:** `claude-haiku-4-5-20251001` → `claude-sonnet-4-5-20251001`
- **Benefit:** Significantly better reasoning, more thorough reviews
- **Cost:** ~4-5x more expensive per review
- **Tradeoff:** Quality vs. Cost
- **Update pricing constants:**
  ```typescript
  // Sonnet pricing (per million tokens)
  const PRICING = {
    input: 3.00,
    output: 15.00,
  } as const;
  ```


#### 2. Increase Max Tokens

- **Change:** `4000` → `8000` tokens
- **Benefit:** Allow for more detailed, comprehensive reviews
- **Cost:** Higher per review, but only if Claude uses more tokens

**Total Effort:** 2 minutes

**Expected Impact:** Higher quality reviews, higher cost

---

## Phase 3: Code Organization (Only If Needed)

**Goal:** Improve maintainability

**Trigger:** If the file becomes hard to navigate or maintain

### Changes

#### Moderate Function Breakdown (5-7 functions, not 15+)

**Extract only when it genuinely helps:**

1. **Prompt building helpers:**

            - `buildReviewPrompt()` - main orchestrator (keep)
            - `buildPromptSections()` - assemble sections in correct order
            - `formatFilesList()` - extract the files.map() logic

2. **Cost calculation:**

            - `calculateReviewCost()` - pricing logic

3. **File operations:**

            - Keep current structure, maybe extract filename generation

**What NOT to do:**

- Don't create `createHeaderSection()` for 2 lines of text
- Don't create `formatSection()` for string concatenation
- Don't split just to split - only when it aids understanding

**Total Effort:** 1-2 hours

**Expected Impact:** Better code navigation, minimal quality impact

---

## Decision Gates

**After Phase 1:**

- ✅ Reviews improved significantly → **STOP, mission accomplished**
- ⚠️ Reviews better but not detailed enough → **Proceed to Phase 2**
- ❌ No improvement → **Investigate prompt engineering deeper**

**After Phase 2:**

- ✅ Reviews now meet quality bar → **STOP**
- ⚠️ Cost too high → **Revert to Haiku, improve prompt further**
- ⚠️ File becoming hard to maintain → **Consider Phase 3**

---

## Implementation Order

### Now (Phase 1):

1. Add constants at top of file
2. Fix type safety (import PRInfo, replace any)
3. Reorder buildReviewPrompt() function
4. Enhance instructions section
5. Test with a real PR review

### Later (If needed):

- Phase 2: Model upgrade
- Phase 3: Code organization

---

## Files Changed

**Phase 1:**

- `src/reviewer.ts` - All changes in this file (~30 line changes)

**Phase 2:**

- `src/reviewer.ts` - Model and pricing constants only

**Phase 3:**

- `src/reviewer.ts` - Function extractions

---

## Testing Checklist

After Phase 1:

- [ ] TypeScript compiles with no errors
- [ ] Run review on a test PR without guidelines
- [ ] Run review on a test PR with guidelines file
- [ ] Verify review mentions guideline compliance/violations
- [ ] Verify cost calculation still accurate
- [ ] Verify file saving works correctly
- [ ] Check review output is more contextual and specific

---

## Key Insights

1. **Prompt order matters immensely** - This is likely 80% of the quality problem
2. **Start small** - Don't refactor until you know it's needed
3. **Measure impact** - Test after each phase before proceeding
4. **Code organization ≠ code quality** - Nice code that gives bad reviews is still bad
5. **Haiku is fast and cheap** - Try to make it work well before upgrading to Sonnet

---

## Related Files

- Original plan: `.cursor/plans/refactor-reviewer-ts-4e6d8d7f.plan.md`
- Implementation: `src/reviewer.ts`
- Types: `src/github.ts` (PRInfo interface)