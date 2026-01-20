'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<any[]>([]);
    const [newProject, setNewProject] = useState({ name: '', posthogKey: '', posthogProjId: '' });
    const [loading, setLoading] = useState(false);
    const [createdProject, setCreatedProject] = useState<any>(null);

    const handleCreate = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                body: JSON.stringify(newProject),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.project) {
                setCreatedProject(data.project);
                setProjects([...projects, data.project]);
                // Save as current project in localStorage
                localStorage.setItem('currentProjectId', data.project.id);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Project Management</h1>
                <p className="text-muted-foreground">Create and manage your Tranzmit AI projects.</p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Create New Project</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input
                                value={newProject.name}
                                onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                                placeholder="My Awesome Project"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>PostHog Project Key</Label>
                            <Input
                                value={newProject.posthogKey}
                                onChange={e => setNewProject({ ...newProject, posthogKey: e.target.value })}
                                placeholder="phc_..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>PostHog Project ID</Label>
                            <Input
                                value={newProject.posthogProjId}
                                onChange={e => setNewProject({ ...newProject, posthogProjId: e.target.value })}
                                placeholder="12345"
                            />
                        </div>
                        <Button onClick={handleCreate} disabled={loading} className="w-full">
                            {loading ? 'Creating...' : 'Create Project'}
                        </Button>
                    </CardContent>
                </Card>

                {createdProject && (
                    <Card className="border-green-500 bg-green-500/10 dark:bg-green-500/20">
                        <CardHeader>
                            <CardTitle className="text-green-700 dark:text-green-300">Project Created Successfully!</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">Project Name</Label>
                                <div className="font-medium text-lg">{createdProject.name}</div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase font-bold">API Key (Save this!)</Label>
                                <div className="bg-white dark:bg-black/50 p-3 rounded font-mono text-sm break-all select-all border">
                                    {createdProject.apiKey}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Use this key in the <code>x-tranzmit-api-key</code> header for API requests.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="pt-8 border-t">
                <h2 className="text-2xl font-bold mb-4">Your Projects</h2>
                {projects.length === 0 ? (
                    <p className="text-muted-foreground">No projects locally loaded yet. Create one to see it here.</p>
                ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                        {projects.map(p => (
                            <Card key={p.id}>
                                <CardHeader>
                                    <CardTitle>{p.name}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground truncate">ID: {p.id}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
