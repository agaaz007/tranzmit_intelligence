import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getProjectFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const project = await getProjectFromRequest(request);
        if (!project) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }

        const body = await request.json();
        const { name, triggerType, funnelId, stepId, config } = body;

        if (!name || !triggerType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const campaign = await prisma.campaign.create({
            data: {
                projectId: project.id,
                name,
                status: 'active',
                triggerType,
                funnelId,
                stepId,
                config: config ? JSON.stringify(config) : undefined,
            },
        });

        return NextResponse.json({ campaign });
    } catch (error) {
        console.error('Failed to create campaign:', error);
        return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const project = await getProjectFromRequest(request);
        if (!project) {
            return NextResponse.json({ error: 'Unauthorized: Invalid API Key' }, { status: 401 });
        }

        const campaigns = await prisma.campaign.findMany({
            where: { projectId: project.id },
            include: { jobs: true },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ campaigns });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }
}
