import { NextResponse } from 'next/server';
import { getDefaultOrganization } from '@/lib/auth';

export async function GET() {
  try {
    const orgData = await getDefaultOrganization();

    if (!orgData) {
      return NextResponse.json({ onboarded: false, reason: 'no_org' });
    }

    // Check if any project has at least one integration configured
    const configuredProject = orgData.projects.find(
      (p) =>
        (p.posthogKey && p.posthogProjId) ||
        (p.mixpanelKey && p.mixpanelProjId) ||
        (p.amplitudeKey && p.amplitudeSecret && p.amplitudeProjId)
    );

    if (configuredProject) {
      return NextResponse.json({
        onboarded: true,
        projectId: configuredProject.id,
        organizationId: orgData.organization.id,
      });
    }

    // Has org and project but no integrations configured
    const defaultProject = orgData.projects[0] || null;
    return NextResponse.json({
      onboarded: false,
      reason: 'no_integration',
      projectId: defaultProject?.id || null,
      organizationId: orgData.organization.id,
      organizationName: orgData.organization.name,
    });
  } catch (error) {
    console.error('[Onboarding Status] Error:', error);
    return NextResponse.json({ onboarded: false, reason: 'error' }, { status: 500 });
  }
}
