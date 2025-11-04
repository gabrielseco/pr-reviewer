<!-- 4e6d8d7f-9912-4e28-ad78-6229666fad86 92a5faa4-3e8e-45e8-9f78-fe608ed58978 -->
# Refactor reviewer.ts for Better Code Reviews

## Objective

Restructure `src/reviewer.ts` to improve prompt quality (for better reviews), type safety, maintainability, and code organization while keeping all functionality in a single well-organized file.

## Key Changes

### 1. Fix Type Safety Issues

**Current Problems:**

- Line 163: `prInfo: any` in `saveReviewToFile()`
- Line 231: `prInfo: any` and `f: any` in `buildReviewPrompt()`

**Solution:**

- Import `PRInfo` interface from `./github.ts`
- Replace all `any` types with proper `PRInfo` type
- Add missing return type annotations

### 2. Improve Prompt Structure for Better Reviews

**Current Issues:**

- Guidelines appear BEFORE the diff (line 253-260)
- Generic instructions that don't leverage the guidelines effectively
- No emphasis on critical areas from guidelines
- Single monolithic prompt building function

**Solution:**

- Reorder: Show diff FIRST, then guidelines (so Claude sees code before applying rules)
- Break down `buildReviewPrompt()` into focused section builders
- Add explicit focus on critical areas when guidelines are provided
- Make prompt more actionable and specific

**New Prompt Flow:**

```
1. Header (who Claude is)
2. PR Info (title, description)
3. Files Changed (list with stats)
4. Diff (the actual code)
5. Guidelines (apply these rules to code above)
6. Instructions (what to review, with emphasis on guideline areas)
```

### 3. Extract and Organize Constants

**Move hardcoded values to constants:**

- Model configuration (line 70-71)
- Pricing rates (line 88-89)
- Review instruction templates (line 273-281)

**Benefits:**

- Easy updates when pricing/models change
- Single source of truth
- Better maintainability

### 4. Break Down Monolithic Functions

**Current Functions:**

- `reviewPR()` - 133 lines doing everything (lines 17-150)
- `buildReviewPrompt()` - 55 lines with multiple concerns (lines 231-286)
- `saveReviewToFile()` - 68 lines mixing file ops and formatting (lines 161-229)

**Refactor Into:**

**Orchestration:**

- `reviewPR()` - simplified main flow
- `loadReviewContext()` - handle context loading
- `fetchAndValidatePR()` - fetch with error handling
- `generateReview()` - Claude API call
- `displayReview()` - console output

**Prompt Building (modular):**

- `buildReviewPrompt()` - orchestrates section assembly
- `createHeaderSection()` - system message
- `createPRInfoSection()` - title, description
- `createFilesSection()` - file list with stats
- `createDiffSection()` - code changes
- `createGuidelinesSection()` - context/guidelines
- `createInstructionsSection()` - what to review
- `formatSection()` - consistent formatting

**File Operations:**

- `saveReviewToFile()` - simplified file writing
- `generateReviewFilename()` - naming logic
- `formatReviewMarkdown()` - markdown assembly
- `formatFrontmatter()` - YAML frontmatter
- `formatMetrics()` - metrics section

**Utilities:**

- `calculateCost()` - pricing calculation
- `extractReviewText()` - parse Claude response

### 5. Add New Interfaces

```typescript
interface PromptSection {
  title: string;
  content: string;
}

interface ReviewResult {
  review: string;
  tokens: { input: number; output: number; total: number };
  cost: number;
  timing: { github: number; claude: number; total: number };
}
```

## File Organization

The refactored file will have clear sections marked by comments:

```
src/reviewer.ts
├── Imports
├── Types & Interfaces
├── Constants (pricing, model, instructions)
├── Main API (reviewPR - public)
├── Orchestration Functions (private helpers)
├── Prompt Building Module (modular prompt construction)
├── File Operations Module (save/format functions)
├── Pricing & Calculations (cost utilities)
└── Utilities (error handling, text extraction)
```

## Expected Improvements

### Code Quality

- 15+ testable functions (vs 3 currently)
- Zero `any` types (currently 4 instances)
- Clear separation of concerns
- Single responsibility per function

### Review Quality (Most Important)

- Claude sees code BEFORE guidelines (better context)
- Instructions explicitly reference guideline areas
- More structured, actionable prompt
- Better emphasis on critical review areas

### Maintainability

- Easy to find and modify specific logic
- Constants in one place
- Each function < 30 lines
- Clear section organization

## Implementation Notes

- Keep all code in single file with section comments for organization
- Maintain backward compatibility - all public APIs unchanged
- No changes to CLI interface or external behavior
- Only internal restructuring for better quality and maintainability

## Files Changed

- `src/reviewer.ts` - complete refactoring (~350 lines, well-organized)

## Testing After Refactor

1. Run a test review to verify output format unchanged
2. Verify file saving works correctly
3. Confirm token usage and cost calculations accurate
4. Test with and without guidelines
5. Validate error handling still works