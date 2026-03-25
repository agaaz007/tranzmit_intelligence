import { describe, expect, it } from 'vitest';
import {
  generateOrganizationSlug,
  generateProjectApiKey,
  getDefaultWorkspaceName,
} from '@/lib/account-provisioning';

describe('account provisioning helpers', () => {
  it('generates tranzmit project API keys with a stable prefix', () => {
    const apiKey = generateProjectApiKey();

    expect(apiKey).toMatch(/^tranzmit_[a-f0-9]{32}$/);
  });

  it('builds workspace names from first names', () => {
    expect(getDefaultWorkspaceName('Agaaz')).toBe("Agaaz's Workspace");
    expect(getDefaultWorkspaceName(null)).toBe('My Workspace');
  });

  it('creates URL-safe organization slugs with a random suffix', () => {
    const slug = generateOrganizationSlug("Agaaz's Workspace");

    expect(slug).toMatch(/^agaaz-s-workspace-[a-f0-9]{6}$/);
  });
});
