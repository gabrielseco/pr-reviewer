import type { PRInfo } from './github';

export interface PRAnalysis {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  totalLines: number;
  fileTypes: Set<string>;
  modifiedPaths: string[];
  keywords: {
    security: boolean;
    breaking: boolean;
    refactor: boolean;
    documentation: boolean;
    bugfix: boolean;
    feature: boolean;
    database: boolean;
    auth: boolean;
    performance: boolean;
  };
  complexity: 'low' | 'medium' | 'high' | 'very-high';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

const SECURITY_KEYWORDS = [
  'security', 'auth', 'authentication', 'authorization', 'jwt', 'token',
  'password', 'crypto', 'encrypt', 'decrypt', 'oauth', 'vulnerability',
  'xss', 'csrf', 'injection', 'sanitize', 'validate'
];

const SECURITY_PATHS = [
  '/auth/', '/security/', '/login/', '/signup/', '/password/',
  '/session/', '/token/', '/crypto/', '/oauth/'
];

const DATABASE_KEYWORDS = ['database', 'sql', 'query', 'migration', 'schema', 'orm'];
const DATABASE_PATHS = ['/migrations/', '/database/', '/db/', '/models/', '/entities/'];
const DATABASE_EXTENSIONS = ['.sql', '.prisma', '.schema'];

const BREAKING_KEYWORDS = ['breaking', 'breaking change', 'major', 'removes', 'deprecated'];
const REFACTOR_KEYWORDS = ['refactor', 'refactoring', 'restructure', 'rewrite', 'cleanup'];
const DOC_KEYWORDS = ['docs', 'documentation', 'readme', 'comment', 'jsdoc'];
const BUG_KEYWORDS = ['fix', 'bug', 'bugfix', 'hotfix', 'patch', 'issue'];
const FEATURE_KEYWORDS = ['feature', 'add', 'implement', 'new'];
const PERFORMANCE_KEYWORDS = ['performance', 'optimize', 'speed', 'cache', 'efficient'];

export function analyzePR(prInfo: PRInfo, userDescription?: string): PRAnalysis {
  const fileTypes = new Set<string>();
  const modifiedPaths: string[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;

  // Analyze files
  for (const file of prInfo.files) {
    const ext = file.filename.match(/\.[^.]+$/)?.[0];
    if (ext) fileTypes.add(ext);
    modifiedPaths.push(file.filename);
    linesAdded += file.additions;
    linesRemoved += file.deletions;
  }

  const totalLines = linesAdded + linesRemoved;
  const filesChanged = prInfo.files.length;

  // Analyze text content - include user description if provided
  const textContent = `${prInfo.title} ${prInfo.description} ${userDescription || ''}`.toLowerCase();
  const pathsContent = modifiedPaths.join(' ').toLowerCase();

  // Detect if changes are test-only
  const isTestOnly = modifiedPaths.every(p => {
    const lower = p.toLowerCase();
    return lower.includes('.test.') || lower.includes('.spec.') ||
           lower.includes('__tests__') || lower.includes('/test/') ||
           lower.includes('/tests/');
  });

  // Detect keywords
  const keywords = {
    security: containsAny(textContent, SECURITY_KEYWORDS) ||
              containsAny(pathsContent, SECURITY_PATHS) ||
              modifiedPaths.some(p => p.toLowerCase().includes('auth')),
    breaking: containsAny(textContent, BREAKING_KEYWORDS),
    refactor: containsAny(textContent, REFACTOR_KEYWORDS),
    documentation: containsAny(textContent, DOC_KEYWORDS) ||
                   modifiedPaths.every(p => p.toLowerCase().includes('readme') ||
                                           p.toLowerCase().includes('.md') ||
                                           p.toLowerCase().includes('doc')),
    bugfix: containsAny(textContent, BUG_KEYWORDS),
    feature: containsAny(textContent, FEATURE_KEYWORDS),
    database: containsAny(textContent, DATABASE_KEYWORDS) ||
              containsAny(pathsContent, DATABASE_PATHS) ||
              Array.from(fileTypes).some(ext => DATABASE_EXTENSIONS.includes(ext)),
    auth: textContent.includes('auth') || textContent.includes('login') ||
          textContent.includes('password'),
    performance: containsAny(textContent, PERFORMANCE_KEYWORDS)
  };

  // Determine complexity
  const complexity = determineComplexity(filesChanged, totalLines, keywords, isTestOnly);

  // Determine risk level
  const riskLevel = determineRiskLevel(keywords, complexity, filesChanged, isTestOnly);

  return {
    filesChanged,
    linesAdded,
    linesRemoved,
    totalLines,
    fileTypes,
    modifiedPaths,
    keywords,
    complexity,
    riskLevel
  };
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

function determineComplexity(
  filesChanged: number,
  totalLines: number,
  keywords: { [key: string]: boolean },
  isTestOnly: boolean
): 'low' | 'medium' | 'high' | 'very-high' {
  // Test-only changes are generally lower complexity
  if (isTestOnly) {
    if (totalLines <= 200) return 'low';
    if (totalLines <= 500) return 'medium';
    return 'high'; // Never very-high for tests
  }

  // Documentation-only changes are always low complexity
  if (keywords.documentation && filesChanged < 5 && totalLines < 200) {
    return 'low';
  }

  // Very simple changes
  if (filesChanged <= 2 && totalLines <= 50) {
    return 'low';
  }

  // Medium changes
  if (filesChanged <= 5 && totalLines <= 300) {
    return 'medium';
  }

  // Large changes
  if (filesChanged <= 15 && totalLines <= 1000) {
    return 'high';
  }

  // Very large changes
  return 'very-high';
}

function determineRiskLevel(
  keywords: { [key: string]: boolean },
  complexity: string,
  filesChanged: number,
  isTestOnly: boolean
): 'low' | 'medium' | 'high' | 'critical' {
  // Test-only changes are inherently lower risk
  if (isTestOnly) {
    // Even refactoring tests is low-medium risk
    if (keywords.refactor || complexity === 'low') return 'low';
    return 'medium'; // Never high/critical for tests
  }

  // Critical: Security + breaking changes, or auth + database
  if ((keywords.security && keywords.breaking) ||
      (keywords.auth && keywords.database)) {
    return 'critical';
  }

  // High: Security, auth, database, or breaking changes alone
  if (keywords.security || keywords.auth || keywords.database || keywords.breaking) {
    return 'high';
  }

  // Medium: Refactors, features with many files
  if (keywords.refactor || (keywords.feature && filesChanged > 5)) {
    return 'medium';
  }

  // Low: Simple bug fixes, docs
  if (keywords.bugfix || keywords.documentation || complexity === 'low') {
    return 'low';
  }

  // Default to medium
  return 'medium';
}
