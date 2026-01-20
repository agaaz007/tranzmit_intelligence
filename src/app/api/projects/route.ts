import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
    try {
        const projects = await prisma.project.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                posthogHost: true,
                posthogProjId: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ projects });
    } catch (error) {
        console.error('Failed to fetch projects:', error);
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
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
            },
        });

        return NextResponse.json({ project });
    } catch (error) {
        console.error('Failed to create project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}
