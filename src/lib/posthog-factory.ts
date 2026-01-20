import { Project } from '@prisma/client';
import { createPostHogClient, PostHogClient } from './posthog';

export function createProjectClient(project: Project): PostHogClient {
    return createPostHogClient({
        apiKey: project.posthogKey,
        projectId: project.posthogProjId,
        host: project.posthogHost,
    });
}
