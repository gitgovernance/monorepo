import { parseRemoteUrl } from './types';

describe('parseRemoteUrl (GM9-GM11)', () => {
  describe('[GM9] HTTPS URLs', () => {
    it('should parse standard GitHub HTTPS URL', () => {
      const ref = parseRemoteUrl('https://github.com/gitgovernance/monorepo.git');
      expect(ref).toEqual({ host: 'github.com', path: 'gitgovernance/monorepo' });
    });

    it('should parse HTTPS URL without .git suffix', () => {
      const ref = parseRemoteUrl('https://github.com/owner/repo');
      expect(ref).toEqual({ host: 'github.com', path: 'owner/repo' });
    });

    it('should parse GitLab nested namespace HTTPS URL', () => {
      const ref = parseRemoteUrl('https://gitlab.mycompany.com/group/subgroup/project.git');
      expect(ref).toEqual({ host: 'gitlab.mycompany.com', path: 'group/subgroup/project' });
    });

    it('should parse self-hosted GitHub Enterprise HTTPS URL', () => {
      const ref = parseRemoteUrl('https://github.corp.com/team/service.git');
      expect(ref).toEqual({ host: 'github.corp.com', path: 'team/service' });
    });

    it('should parse Bitbucket HTTPS URL', () => {
      const ref = parseRemoteUrl('https://bitbucket.org/workspace/repo.git');
      expect(ref).toEqual({ host: 'bitbucket.org', path: 'workspace/repo' });
    });
  });

  describe('[GM10] SSH URLs', () => {
    it('should parse standard GitHub SSH URL', () => {
      const ref = parseRemoteUrl('git@github.com:gitgovernance/monorepo.git');
      expect(ref).toEqual({ host: 'github.com', path: 'gitgovernance/monorepo' });
    });

    it('should parse SSH URL without .git suffix', () => {
      const ref = parseRemoteUrl('git@github.com:owner/repo');
      expect(ref).toEqual({ host: 'github.com', path: 'owner/repo' });
    });

    it('should parse GitLab SSH URL with nested namespace', () => {
      const ref = parseRemoteUrl('git@gitlab.mycompany.com:group/subgroup/project.git');
      expect(ref).toEqual({ host: 'gitlab.mycompany.com', path: 'group/subgroup/project' });
    });

    it('should parse self-hosted SSH URL', () => {
      const ref = parseRemoteUrl('git@gitea.internal.net:user/project.git');
      expect(ref).toEqual({ host: 'gitea.internal.net', path: 'user/project' });
    });
  });

  describe('[GM11] Unparseable URLs', () => {
    it('should return null for empty string', () => {
      expect(parseRemoteUrl('')).toBeNull();
    });

    it('should return null for local path', () => {
      expect(parseRemoteUrl('/path/to/repo')).toBeNull();
    });

    it('should return null for relative path', () => {
      expect(parseRemoteUrl('../other-repo')).toBeNull();
    });

    it('should return null for random string', () => {
      expect(parseRemoteUrl('not-a-url')).toBeNull();
    });
  });
});
