import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserProjects, getDefaultOrganization } from '@/lib/auth';
import crypto from 'crypto';

export async function GET() {
    try {
        // Get only projects the user has access to
        const projects = await getUserProjects();

        return NextResponse.json({ projects });
    } catch (error) {
        console.error('Failed to fetch projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get user's default organization
        const orgData = await getDefaultOrganization();

        if (!orgData) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            name,
            posthogKey,
            posthogHost,
            posthogProjId,
            mixpanelKey,
            mixpanelSecret,
            mixpanelProjId,
            mixpanelHost,
        } = body;

        // Require name and at least one analytics integration
        const hasPostHog = posthogKey && posthogProjId;
        const hasMixpanel = mixpanelKey && mixpanelProjId;

        if (!name) {
            return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        }

        if (!hasPostHog && !hasMixpanel) {
            return NextResponse.json({
                error: 'At least one analytics integration (PostHog or Mixpanel) is required'
            }, { status: 400 });
        }

        // Generate a random API key for the project
        const apiKey = `tranzmit_${crypto.randomBytes(16).toString('hex')}`;

        const project = await prisma.project.create({
            data: {
                name,
                apiKey,
                // PostHog fields
                posthogKey: posthogKey || null,
                posthogHost: posthogHost || 'https://us.posthog.com',
                posthogProjId: posthogProjId || null,
                // Mixpanel fields
                mixpanelKey: mixpanelKey || null,
                mixpanelSecret: mixpanelSecret || null,
                mixpanelProjId: mixpanelProjId || null,
                mixpanelHost: mixpanelHost || 'https://mixpanel.com',
                organizationId: orgData.organization.id,
            },
        });

        return NextResponse.json({ project });
    } catch (error) {
        console.error('Failed to create project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}
