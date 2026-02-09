'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check } from 'lucide-react';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<any[]>([]);
    const [newProject, setNewProject] = useState({ name: '', posthogKey: '', posthogProjId: '', posthogHost: 'https://us.posthog.com' });
    const [loading, setLoading] = useState(false);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [createdProject, setCreatedProject] = useState<any>(null);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

    // Load existing projects on mount
    useEffect(() => {
        const loadProjects = async () => {
            try {
                const res = await fetch('/api/projects');
                const data = await res.json();
                if (data.projects) {
                    setProjects(data.projects);
                    // Auto-select first project if none selected
                    const storedId = localStorage.getItem('currentProjectId');
                    if (storedId && data.projects.find((p: any) => p.id === storedId)) {
                        setCurrentProjectId(storedId);
                    } else if (data.projects.length > 0) {
                        localStorage.setItem('currentProjectId', data.projects[0].id);
                        setCurrentProjectId(data.projects[0].id);
                    }
                }
            } catch (e) {
                console.error('Failed to load projects:', e);
            } finally {
                setLoadingProjects(false);
            }
        };
        loadProjects();
    }, []);

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
                setCurrentProjectId(data.project.id);
                // Clear form
                setNewProject({ name: '', posthogKey: '', posthogProjId: '', posthogHost: 'https://us.posthog.com' });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const selectProject = (projectId: string) => {
        localStorage.setItem('currentProjectId', projectId);
        setCurrentProjectId(projectId);
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
                        <div className="space-y-2">
                            <Label>PostHog Host (optional)</Label>
                            <Input
                                value={newProject.posthogHost}
                                onChange={e => setNewProject({ ...newProject, posthogHost: e.target.value })}
                                placeholder="https://us.posthog.com"
                            />
                            <p className="text-xs text-muted-foreground">Leave as default for US cloud</p>
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
                {loadingProjects ? (
                    <p className="text-muted-foreground">Loading projects...</p>
                ) : projects.length === 0 ? (
                    <p className="text-muted-foreground">No projects yet. Create one above to get started.</p>
                ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                        {projects.map(p => (
                            <Card 
                                key={p.id} 
                                className={`cursor-pointer transition-all ${currentProjectId === p.id ? 'border-green-500 ring-2 ring-green-500/20' : 'hover:border-gray-400'}`}
                                onClick={() => selectProject(p.id)}
                            >
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        {p.name}
                                        {currentProjectId === p.id && <Check className="w-5 h-5 text-green-500" />}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xs text-muted-foreground truncate">ID: {p.id}</div>
                                    <div className="text-xs text-muted-foreground truncate">PostHog Project: {p.posthogProjId}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
