import { NextRequest } from 'next/server';
import { prisma } from './db';

export async function getProjectFromRequest(request: NextRequest) {
    const apiKey = request.headers.get('x-tranzmit-api-key');

    if (!apiKey) {
        return null;
    }

    const project = await prisma.project.findUnique({
        where: { apiKey },
    });

    return project;
}
