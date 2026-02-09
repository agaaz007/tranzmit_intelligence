import { prisma } from '../db';
import { createProjectClient } from '../posthog-factory';
import { processFunnelData } from '../posthog';

export class JobQueue {
    private isProcessing = false;

    async processNextJob() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Fetch next pending job
            const job = await prisma.job.findFirst({
                where: { status: 'pending' },
                include: {
                    campaign: {
                        include: { project: true }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            if (!job) {
                this.isProcessing = false;
                return;
            }

            // Mark as processing
            await prisma.job.update({
                where: { id: job.id },
                data: { status: 'processing' }
            });

            console.log(`[JobQueue] Processing job ${job.id} of type ${job.type} for project ${job.campaign.project.name}`);

            try {
                const result = await this.executeJob(job);

                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        status: 'completed',
                        result: JSON.stringify(result)
                    }
                });
            } catch (error) {
                console.error(`[JobQueue] Job ${job.id} failed:`, error);
                await prisma.job.update({
                    where: { id: job.id },
                    data: {
                        status: 'failed',
                        result: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
                    }
                });
            }

        } catch (error) {
            console.error('[JobQueue] Error fetching job:', error);
        } finally {
            this.isProcessing = false;
            // Immediate check for next job
            // In a real serverless env, this might be triggered via cron or API
            setTimeout(() => this.processNextJob(), 1000);
        }
    }

    private async executeJob(job: any) {
        // Initialize PostHog client for this specific project
        const posthog = createProjectClient(job.campaign.project);

        switch (job.type) {
            case 'ANALYZE_FUNNEL': {
                if (!job.campaign.funnelId) throw new Error('No Funnel ID in campaign');

                // Configurable threshold, default 10%
                let threshold = 10;
                if (job.campaign.config) {
                    try {
                        const config = JSON.parse(job.campaign.config);
                        if (config.dropOffThreshold) threshold = Number(config.dropOffThreshold);
                    } catch (e) { /* ignore */ }
                }

                console.log(`[Worker] Analyzing funnel ${job.campaign.funnelId} (Threshold: ${threshold}%)`);
                const insight = await posthog.getFunnelWithResults(Number(job.campaign.funnelId));
                const processed = processFunnelData(insight);

                // Analyze the specific step (default to step 0 if not set, but usually we want the dropoff *after* a step)
                const stepIndex = job.campaign.stepId ? Number(job.campaign.stepId) : 0;
                const step = processed.steps[stepIndex];

                if (!step) throw new Error(`Step ${stepIndex} not found in funnel`);

                console.log(`[Worker] Step "${step.name}": Drop-off Rate ${step.dropOffRate}% (Count: ${step.dropOffCount})`);

                if (step.dropOffRate > threshold) {
                    console.log('[Worker] Drop-off exceeds threshold! Scheduling Cohort Creation...');

                    // Create a follow-up job to create the cohort
                    await prisma.job.create({
                        data: {
                            campaignId: job.campaignId,
                            type: 'CREATE_COHORT',
                            status: 'pending',
                            // Pass the step data to the next job
                            result: JSON.stringify({
                                triggerReason: `High drop-off at step ${step.name} (${step.dropOffRate}%)`,
                                stepIndex: stepIndex
                            })
                        }
                    });

                    return {
                        status: 'PROBLEM_DETECTED',
                        dropOffRate: step.dropOffRate,
                        message: 'High drop-off detected. Cohort job created.'
                    };
                }

                return {
                    status: 'OK',
                    dropOffRate: step.dropOffRate,
                    message: 'Drop-off within limits.'
                };
            }

            case 'CREATE_COHORT': {
                console.log('Creating cohort for campaign', job.campaign.name);

                // 1. Get the step index from the previous analysis (or campaign default)
                // We'll peek at the campaign default first
                const stepIndex = job.campaign.stepId ? Number(job.campaign.stepId) : 0;
                const funnelId = Number(job.campaign.funnelId);

                // 2. Fetch the actual people who dropped off
                // Note: getDroppedPersons returns raw PostHog people objects
                const rawPeople = await posthog.getDroppedPersons(funnelId, stepIndex);

                if (!Array.isArray(rawPeople) || rawPeople.length === 0) {
                    return { status: 'SKIPPED', message: 'No people found in drop-off.' };
                }

                // 3. Extract IDs. PostHog 'people' result usually has 'distinct_ids' array or 'uuid'.
                // We'll try to find a usable ID.
                const distinctIds: string[] = rawPeople
                    .map((p: any) => p.distinct_ids?.[0])
                    .filter(Boolean);

                if (distinctIds.length === 0) {
                    return { status: 'FAILED', message: 'Could not extract distinct IDs from people data.' };
                }

                console.log(`[Worker] Found ${distinctIds.length} users to cohort.`);

                // 4. Create Cohort
                const cohortName = `[Tranzmit] Drop-off: ${job.campaign.name} - ${new Date().toISOString().split('T')[0]}`;
                const cohort = await posthog.createCohort(cohortName, distinctIds);

                return {
                    status: 'CREATED',
                    cohortId: cohort.id,
                    cohortName: cohortName,
                    count: distinctIds.length
                };
            }

            default:
                throw new Error(`Unknown job type: ${job.type}`);
        }
    }

}

// Singleton instance
export const jobQueue = new JobQueue();
