import type { Recommendations, ReviewOption } from './recommendation-engine.js';
import type { PRAnalysis } from './pr-analyzer.js';

export async function promptUserSelection(
  recommendations: Recommendations,
  analysis: PRAnalysis
): Promise<ReviewOption | null> {
  console.log('\n📊 PR Analysis Results\n');
  console.log(`  ${recommendations.summary}`);
  console.log(`  Complexity: ${analysis.complexity} | Risk: ${analysis.riskLevel}`);

  // Show detected concerns
  const concerns: string[] = [];
  if (analysis.keywords.security) concerns.push('🔒 Security');
  if (analysis.keywords.auth) concerns.push('🔐 Authentication');
  if (analysis.keywords.database) concerns.push('🗄️  Database');
  if (analysis.keywords.breaking) concerns.push('⚠️  Breaking Changes');
  if (analysis.keywords.performance) concerns.push('⚡ Performance');
  if (analysis.keywords.refactor) concerns.push('♻️  Refactor');

  if (concerns.length > 0) {
    console.log(`  Detected: ${concerns.join(', ')}\n`);
  } else {
    console.log('');
  }

  // Show primary recommendation
  console.log('🎯 Recommended Review Mode:\n');
  if (recommendations.primary) {
    displayOption(recommendations.primary, 0, true);
  }
  console.log('');

  // Show alternatives
  if (recommendations.alternatives.length > 0) {
    console.log('📋 Alternative Options:\n');
    recommendations.alternatives.forEach((option, index) => {
      displayOption(option, index + 1, false);
      if (index < recommendations.alternatives.length - 1) {
        console.log('');
      }
    });
    console.log('');
  }

  // Interactive selection
  const allOptions = [recommendations.primary, ...recommendations.alternatives];
  console.log('─'.repeat(60));
  console.log('\nChoose a review mode:');
  console.log('  0 - Use recommended mode (default)');

  for (let i = 1; i < allOptions.length; i++) {
    console.log(`  ${i} - ${allOptions[i]?.name || ''}`);
  }

  console.log('  q - Cancel\n');

  // Get user input
  const choice = await getUserInput('Enter your choice [0]: ');

  if (choice === '' || choice === '0') {
    return allOptions[0] || null;
  }

  if (choice.toLowerCase() === 'q') {
    console.log('\n❌ Review cancelled.\n');
    return null;
  }

  const choiceNum = parseInt(choice);
  if (isNaN(choiceNum) || choiceNum < 0 || choiceNum >= allOptions.length) {
    console.log('\n⚠️  Invalid choice. Using recommended mode.\n');
    return allOptions[0] || null;
  }

  return allOptions[choiceNum] || null;
}

function displayOption(option: ReviewOption, index: number, isRecommended: boolean) {
  const prefix = isRecommended ? '  ✨' : `  ${index}.`;

  console.log(`${prefix} ${option.name}${isRecommended ? ' (Recommended)' : ''}`);
  console.log(`     ${option.description}`);
  console.log(`     💰 ${option.costEstimate} | ⏱️  ${option.timeEstimate} | 🎯 ${option.accuracyEstimate} accuracy`);
  console.log(`     📝 ${option.reason}`);
  console.log(`     💻 Command: bun run src/index.ts <PR> ${option.command}`);
}

async function getUserInput(prompt: string): Promise<string> {
  process.stdout.write(prompt);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';

    const onData = (key: string) => {
      // Handle Ctrl+C
      if (key === '\u0003') {
        process.exit();
      }

      // Handle Enter
      if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        console.log('');
        resolve(input);
        return;
      }

      // Handle Backspace
      if (key === '\u007f') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      // Handle regular characters
      if (key >= ' ' && key <= '~') {
        input += key;
        process.stdout.write(key);
      }
    };

    stdin.on('data', onData);
  });
}

export function displayAnalysisOnly(
  recommendations: Recommendations,
  analysis: PRAnalysis
): void {
  console.log('\n📊 PR Analysis Results\n');
  console.log(`  ${recommendations.summary}`);
  console.log(`  Complexity: ${analysis.complexity} | Risk: ${analysis.riskLevel}\n`);

  // Show detected concerns
  const concerns: string[] = [];
  if (analysis.keywords.security) concerns.push('🔒 Security');
  if (analysis.keywords.auth) concerns.push('🔐 Authentication');
  if (analysis.keywords.database) concerns.push('🗄️  Database');
  if (analysis.keywords.breaking) concerns.push('⚠️  Breaking Changes');
  if (analysis.keywords.performance) concerns.push('⚡ Performance');
  if (analysis.keywords.refactor) concerns.push('♻️  Refactor');

  if (concerns.length > 0) {
    console.log(`  Detected: ${concerns.join(', ')}\n`);
  }

  console.log('🎯 Recommended Command:\n');
  console.log(`  bun run src/index.ts <PR> ${recommendations.primary?.command || ''}\n`);
  console.log(`  ${recommendations.primary?.reason || ''}`);
  console.log(`  💰 ${recommendations.primary?.costEstimate || ''} | ⏱️  ${recommendations.primary?.timeEstimate || ''} | 🎯 ${recommendations.primary?.accuracyEstimate || ''} accuracy\n`);
}
