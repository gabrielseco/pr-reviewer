import * as readline from 'readline';
import { existsSync } from 'fs';
import {
  loadConfig,
  updateConfig,
  extractRepoFromUrl,
  getGuidelinesForRepo,
  validateGuidelinesPath,
  type Config
} from './config';

interface InteractiveResult {
  prUrlOrNumber: string;
  contextPath?: string;
  repo?: string;
  savePreferences?: boolean;
}

/**
 * Create readline interface for prompts
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the answer
 */
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Validate PR URL or number format
 */
function validatePrInput(input: string): { valid: boolean; repo?: string; isUrl: boolean } {
  // Check if it's a GitHub URL
  const urlMatch = input.match(/github\.com\/([^\/]+\/[^\/]+)\/pull\/\d+/);
  if (urlMatch) {
    return { valid: true, repo: urlMatch[1], isUrl: true };
  }

  // Check if it's just a number
  if (/^\d+$/.test(input)) {
    return { valid: true, isUrl: false };
  }

  return { valid: false, isUrl: false };
}

/**
 * Run interactive mode to gather PR review parameters
 */
export async function runInteractive(): Promise<InteractiveResult> {
  const rl = createInterface();
  const config = await loadConfig();

  console.log('\n🔍 PR Reviewer - Interactive Mode\n');

  try {
    // Step 1: Get PR URL or number
    let prUrlOrNumber: string = '';
    let detectedRepo: string | undefined;
    let isUrl = false;

    while (!prUrlOrNumber) {
      const input = await question(rl, 'Enter PR URL or number: ');
      const validation = validatePrInput(input);

      if (!validation.valid) {
        console.log('❌ Invalid input. Please enter a GitHub PR URL or a PR number.\n');
        continue;
      }

      prUrlOrNumber = input;
      detectedRepo = validation.repo;
      isUrl = validation.isUrl;

      // If it's just a number, we need a repo
      if (!isUrl) {
        const repoInput = await question(rl, 'Repository (owner/repo): ');
        detectedRepo = repoInput;

        if (!detectedRepo) {
          console.log('❌ Repository is required when using PR number.\n');
          prUrlOrNumber = '';
          continue;
        }
      }

      break;
    }

    if (detectedRepo) {
      console.log(`✓ Detected repository: ${detectedRepo}\n`);
    }

    // Step 2: Get guidelines path
    const autoGuidelines = await getGuidelinesForRepo(detectedRepo || prUrlOrNumber, config);
    let contextPath: string | undefined;

    console.log('Select review guidelines:');

    if (autoGuidelines) {
      const exists = validateGuidelinesPath(autoGuidelines);
      console.log(`  1. Auto-detected for this repo: ${autoGuidelines} ${exists ? '✓' : '(not found)'}`);
    }
    if (config.defaultGuidelines) {
      const exists = validateGuidelinesPath(config.defaultGuidelines);
      console.log(`  2. Default guidelines: ${config.defaultGuidelines} ${exists ? '✓' : '(not found)'}`);
    }
    console.log('  c. Custom path...');
    console.log('  n. No guidelines\n');

    const guidelineChoice = await question(rl, 'Your choice (1/2/c/n): ');

    switch (guidelineChoice.toLowerCase()) {
      case '1':
        contextPath = autoGuidelines;
        break;
      case '2':
        contextPath = config.defaultGuidelines;
        break;
      case 'c': {
        const customPath = await question(rl, 'Enter guidelines file path: ');
        if (customPath) {
          contextPath = customPath;
          if (!validateGuidelinesPath(customPath)) {
            console.log(`⚠️  Warning: File not found at ${customPath}`);
            const proceed = await question(rl, 'Continue anyway? (y/n): ');
            if (proceed.toLowerCase() !== 'y') {
              rl.close();
              process.exit(0);
            }
          }
        }
        break;
      }
      case 'n':
        contextPath = undefined;
        break;
      default:
        contextPath = autoGuidelines || config.defaultGuidelines;
    }

    if (contextPath) {
      console.log(`✓ Using guidelines: ${contextPath}\n`);
    }

    // Step 3: Ask to save preferences
    let savePreferences = false;
    if (detectedRepo && contextPath) {
      const save = await question(rl, `Save these settings for ${detectedRepo}? (y/n): `);
      savePreferences = save.toLowerCase() === 'y';

      if (savePreferences) {
        await updateConfig({
          repoGuidelines: {
            [detectedRepo]: contextPath,
          },
        });
        console.log('✓ Preferences saved!\n');
      }
    }

    rl.close();

    return {
      prUrlOrNumber,
      contextPath,
      repo: detectedRepo,
      savePreferences,
    };
  } catch (error) {
    rl.close();
    throw error;
  }
}
