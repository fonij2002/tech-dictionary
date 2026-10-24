import config from '../../site.config.json';

if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(config.repository)) {
  throw new Error('Configure repository as an https://github.com/owner/repository URL.');
}
export const site = { ...config, repository: config.repository.replace(/\/$/, '') };

export function editURL(category: string) {
  return `${site.repository}/edit/${encodeURIComponent(site.defaultBranch)}/data/terms/${category}.yaml`;
}
