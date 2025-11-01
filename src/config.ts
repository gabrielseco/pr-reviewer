import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface Config {
  defaultGuidelines?: string;
  repoGuidelines?: Record<string, string>; // "owner/repo" -> guideline path
}

const CONFIG_FILENAME = '.pr-reviewer.config.json';

/**
 * Get the config file path. Checks project root first, then home directory.
 */
export function getConfigPath(): string {
  const projectConfig = join(process.cwd(), CONFIG_FILENAME);
  if (existsSync(projectConfig)) {
    return projectConfig;
  }
  return join(homedir(), CONFIG_FILENAME);
}

/**
 * Load config from file, returns empty object if not found
 */
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  try {
    if (existsSync(configPath)) {
      const file = Bun.file(configPath);
      const content = await file.text();
      return JSON.parse(content) as Config;
    }
  } catch (error) {
    console.warn(`Warning: Failed to load config from ${configPath}:`, error instanceof Error ? error.message : String(error));
  }

  return {};
}

/**
 * Save config to file
 */
export async function saveConfig(config: Config): Promise<void> {
  const configPath = getConfigPath();

  try {
    await Bun.write(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save config to ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update config with partial changes
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const config = await loadConfig();
  const newConfig = { ...config, ...updates };

  // Merge nested objects properly
  if (updates.repoGuidelines) {
    newConfig.repoGuidelines = { ...config.repoGuidelines, ...updates.repoGuidelines };
  }

  await saveConfig(newConfig);
  return newConfig;
}

/**
 * Extract owner/repo from GitHub PR URL or return undefined
 */
export function extractRepoFromUrl(url: string): string | undefined {
  // Match github.com/owner/repo/pull/123
  const match = url.match(/github\.com\/([^\/]+\/[^\/]+)\/pull\/\d+/);
  return match ? match[1] : undefined;
}

/**
 * Get guidelines path for a specific repo, falling back to defaults
 */
export async function getGuidelinesForRepo(repoOrUrl: string, config?: Config): Promise<string | undefined> {
  const cfg = config || await loadConfig();

  // Try to extract repo from URL
  const repo = extractRepoFromUrl(repoOrUrl) || repoOrUrl;

  // Check repo-specific guidelines
  if (cfg.repoGuidelines && cfg.repoGuidelines[repo]) {
    return cfg.repoGuidelines[repo];
  }

  // Fall back to default guidelines
  return cfg.defaultGuidelines;
}

/**
 * Validate that a guidelines file exists
 */
export function validateGuidelinesPath(path: string): boolean {
  return existsSync(path);
}
