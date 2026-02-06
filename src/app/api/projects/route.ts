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
        const { name, posthogKey, posthogHost, posthogProjId } = body;

        if (!name || !posthogKey || !posthogProjId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Generate a random API key for the project
        const apiKey = `tranzmit_${crypto.randomBytes(16).toString('hex')}`;

        const project = await prisma.project.create({
            data: {
                name,
                apiKey,
                posthogKey,
                posthogHost: posthogHost || 'https://us.posthog.com',
                posthogProjId,
                organizationId: orgData.organization.id,
            },
        });

        return NextResponse.json({ project });
    } catch (error) {
        console.error('Failed to create project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}
