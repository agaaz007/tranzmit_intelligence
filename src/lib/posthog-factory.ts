import { Project } from '@prisma/client';
import { createPostHogClient, PostHogClient } from './posthog';

export function createProjectClient(project: Project): PostHogClient {
    if (!project.posthogKey || !project.posthogProjId) {
        throw new Error('PostHog not configured for this project');
    }
    return createPostHogClient({
        apiKey: project.posthogKey,
        projectId: project.posthogProjId,
        host: project.posthogHost || 'https://us.posthog.com',
    });
}
