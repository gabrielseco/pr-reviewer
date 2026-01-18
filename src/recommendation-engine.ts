import type { PRAnalysis } from './pr-analyzer.js';

export interface ReviewOption {
  name: string;
  command: string;
  description: string;
  costEstimate: string;
  timeEstimate: string;
  accuracyEstimate: string;
  reason: string;
  recommended?: boolean;
}

export interface Recommendations {
  primary: ReviewOption | undefined;
  alternatives: ReviewOption[];
  summary: string;
}

export function generateRecommendations(analysis: PRAnalysis): Recommendations {
  const options: ReviewOption[] = [];

  // Build options based on analysis
  const {
    filesChanged,
    totalLines,
    keywords,
    complexity,
    riskLevel
  } = analysis;

  // Option 1: Maximum Scrutiny (Multi-Agent + Agentic + Opus)
  if (riskLevel === 'critical' || (keywords.security && keywords.breaking)) {
    options.push({
      name: 'Maximum Scrutiny',
      command: '--multi-agent --agentic --agents security,logic --min-confidence 85',
      description: 'Deep analysis with tool exploration and extended thinking',
      costEstimate: '~$0.45-0.60',
      timeEstimate: '~60s',
      accuracyEstimate: '98%',
      reason: 'Critical security/breaking changes require maximum verification',
      recommended: true
    });
  }

  // Option 2: Security + Logic Focus (Multi-Agent + Agentic)
  if ((keywords.security || keywords.auth || keywords.database) && riskLevel !== 'low') {
    options.push({
      name: 'Security-Focused Deep Review',
      command: '--multi-agent --agentic --agents security,logic',
      description: 'Security and logic agents with codebase exploration',
      costEstimate: '~$0.30-0.40',
      timeEstimate: '~45s',
      accuracyEstimate: '95%',
      reason: getSecurityReason(keywords),
      recommended: options.length === 0 // Recommend if no critical option
    });
  }

  // Option 3: Multi-Agent (No Tools) - Fast Security Check
  if (keywords.security || keywords.auth || keywords.database || riskLevel === 'high') {
    options.push({
      name: 'Fast Security Review',
      command: '--multi-agent --agents security,logic',
      description: 'Parallel security and logic review without deep exploration',
      costEstimate: '~$0.08-0.11',
      timeEstimate: '~8s',
      accuracyEstimate: '85%',
      reason: 'Good balance for security-related changes from trusted authors'
    });
  }

  // Option 4: Full Multi-Agent
  if (complexity === 'high' || complexity === 'very-high' || filesChanged > 10) {
    options.push({
      name: 'Comprehensive Review',
      command: '--multi-agent',
      description: 'All agents review from different perspectives',
      costEstimate: '~$0.11',
      timeEstimate: '~10s',
      accuracyEstimate: '85%',
      reason: `Large changeset (${filesChanged} files, ${totalLines} lines) benefits from multiple perspectives`,
      recommended: options.length === 0 && !keywords.documentation
    });
  }

  // Option 5: Agentic Single Model
  if ((keywords.refactor || keywords.feature) && !keywords.security && complexity !== 'low') {
    options.push({
      name: 'Deep Code Exploration',
      command: '--agentic --model sonnet',
      description: 'Single model with codebase exploration tools',
      costEstimate: '~$0.12-0.18',
      timeEstimate: '~30s',
      accuracyEstimate: '88%',
      reason: 'Refactoring/features benefit from understanding full context'
    });
  }

  // Option 6: Performance Focus
  if (keywords.performance || keywords.database) {
    options.push({
      name: 'Performance Review',
      command: '--multi-agent --agents performance,logic',
      description: 'Focus on performance and logic issues',
      costEstimate: '~$0.06',
      timeEstimate: '~6s',
      accuracyEstimate: '80%',
      reason: 'Performance-related changes need specialized review'
    });
  }

  // Option 7: Standard Sonnet (Medium Complexity)
  if (complexity === 'medium' || (filesChanged <= 8 && totalLines <= 500)) {
    options.push({
      name: 'Standard Review (Sonnet)',
      command: '--model sonnet',
      description: 'Single-pass review with capable model',
      costEstimate: '~$0.08-0.12',
      timeEstimate: '~5s',
      accuracyEstimate: '75%',
      reason: 'Good for medium-complexity changes'
    });
  }

  // Option 8: Quick Review (Haiku) - Always include as cheap option
  options.push({
    name: 'Quick Review',
    command: '--model haiku',
    description: 'Fast, cost-effective single-pass review',
    costEstimate: '~$0.01',
    timeEstimate: '~3s',
    accuracyEstimate: '70%',
    reason: keywords.documentation
      ? 'Documentation changes need minimal review'
      : 'Fast check for simple changes or trusted authors',
    recommended: options.length === 0 && (keywords.documentation || complexity === 'low')
  });

  // Sort options by priority (recommended first, then by cost descending)
  const sortedOptions = options.sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    // Higher cost = more thorough, show first
    const costA = parseCost(a.costEstimate);
    const costB = parseCost(b.costEstimate);
    return costB - costA;
  });

  // Primary recommendation is the first one
  const primary = sortedOptions[0];
  const alternatives = sortedOptions.slice(1);

  // Generate summary
  const summary = generateSummary(analysis, primary);

  return {
    primary,
    alternatives,
    summary
  };
}

function getSecurityReason(keywords: { [key: string]: boolean }): string {
  const concerns: string[] = [];
  if (keywords.auth) concerns.push('authentication');
  if (keywords.database) concerns.push('database');
  if (keywords.security) concerns.push('security');

  return `Changes involve ${concerns.join(' and ')} - requires verification`;
}

function parseCost(costEstimate: string): number {
  // Extract max cost from string like "~$0.45-0.60" or "~$0.11"
  const match = costEstimate.match(/\$([\d.]+)(?:-[\d.]+)?/);
  if (!match) return 0;
  return parseFloat(match[1] || '0');
}

function generateSummary(analysis: PRAnalysis, primary: ReviewOption | undefined): string {
  const parts: string[] = [];

  parts.push(`${analysis.filesChanged} file${analysis.filesChanged === 1 ? '' : 's'} changed`);
  parts.push(`+${analysis.linesAdded} -${analysis.linesRemoved}`);

  const concerns: string[] = [];
  if (analysis.keywords.security) concerns.push('Security');
  if (analysis.keywords.auth) concerns.push('Auth');
  if (analysis.keywords.database) concerns.push('Database');
  if (analysis.keywords.breaking) concerns.push('Breaking');
  if (analysis.keywords.performance) concerns.push('Performance');

  if (concerns.length > 0) {
    parts.push(concerns.join(', ') + ' related');
  }

  return parts.join(' | ');
}
