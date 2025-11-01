import { Octokit } from '@octokit/rest';

export interface PRInfo {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  description: string;
  diff: string;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}

export async function fetchPRInfo(
  prUrlOrNumber: string,
  repo: string | undefined,
  githubToken: string
): Promise<PRInfo> {
  const octokit = new Octokit({ auth: githubToken });

  let owner: string;
  let repoName: string;
  let prNumber: number;

  // Parse PR URL or number
  if (prUrlOrNumber.includes('github.com')) {
    const match = prUrlOrNumber.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
    if (!match) {
      throw new Error('Invalid GitHub PR URL format');
    }
    [, owner, repoName, prNumber] = match.map((v, i) => i === 3 ? parseInt(v) : v) as [string, string, string, number];
  } else {
    // Assume it's a PR number
    if (!repo) {
      throw new Error('Repository must be specified when using PR number (use --repo owner/repo)');
    }
    const [repoOwner, repoNamePart] = repo.split('/');
    if (!repoOwner || !repoNamePart) {
      throw new Error('Invalid repository format. Use: owner/repo');
    }
    owner = repoOwner;
    repoName = repoNamePart;
    prNumber = parseInt(prUrlOrNumber);
  }

  console.log(`Fetching PR #${prNumber} from ${owner}/${repoName}...`);

  // Fetch PR details
  const { data: pr } = await octokit.pulls.get({
    owner,
    repo: repoName,
    pull_number: prNumber,
  });

  // Fetch PR files
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo: repoName,
    pull_number: prNumber,
  });

  // Fetch PR diff
  const { data: diff } = await octokit.pulls.get({
    owner,
    repo: repoName,
    pull_number: prNumber,
    mediaType: {
      format: 'diff',
    },
  });

  return {
    owner,
    repo: repoName,
    prNumber,
    title: pr.title,
    description: pr.body || '',
    diff: diff as unknown as string,
    files: files.map(file => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch,
    })),
  };
}
