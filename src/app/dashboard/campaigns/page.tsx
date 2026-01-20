'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function CampaignsPage() {
    // In a real app, this would be in a context provider
    const [apiKey, setApiKey] = useState('');
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Form state
    const [newCampaign, setNewCampaign] = useState({
        name: '',
        triggerType: 'automatic_dropoff',
        funnelId: '',
        stepId: '0'
    });

    // Load API Key from local storage on mount
    useEffect(() => {
        const storedKey = localStorage.getItem('tranzmit_api_key');
        if (storedKey) setApiKey(storedKey);
    }, []);

    const fetchCampaigns = async () => {
        if (!apiKey) return;
        setLoading(true);
        try {
            const res = await fetch('/api/campaigns', {
                headers: { 'x-tranzmit-api-key': apiKey }
            });
            const data = await res.json();
            if (data.campaigns) {
                setCampaigns(data.campaigns);
            }
        } catch (e) {
            console.error('Failed to fetch campaigns', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!apiKey) {
            alert('Please enter a Project API Key first');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tranzmit-api-key': apiKey
                },
                body: JSON.stringify(newCampaign)
            });
            const data = await res.json();
            if (data.campaign) {
                setCampaigns([data.campaign, ...campaigns]);
                setNewCampaign({ name: '', triggerType: 'automatic_dropoff', funnelId: '', stepId: '0' });
            } else {
                alert('Error creating campaign: ' + JSON.stringify(data.error));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
                    <p className="text-muted-foreground">Manage your autopilot research campaigns.</p>
                </div>
                <div className="flex gap-2 items-end">
                    <div className="grid gap-1.5">
                        <Label htmlFor="apiKey">Project API Key</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                localStorage.setItem('tranzmit_api_key', e.target.value);
                            }}
                            className="w-64"
                            placeholder="tranzmit_..."
                        />
                    </div>
                    <Button onClick={fetchCampaigns} variant="outline" disabled={!apiKey}>
                        Load
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
                {/* Create Form */}
                <Card className="md:col-span-1 h-fit">
                    <CardHeader>
                        <CardTitle>New Campaign</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Campaign Name</Label>
                            <Input
                                value={newCampaign.name}
                                onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                                placeholder="Checkout Drop-off Probe"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Funnel ID</Label>
                            <Input
                                value={newCampaign.funnelId}
                                onChange={e => setNewCampaign({ ...newCampaign, funnelId: e.target.value })}
                                placeholder="123 (PostHog Funnel ID)"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Step Index (to probe)</Label>
                            <Input
                                type="number"
                                value={newCampaign.stepId}
                                onChange={e => setNewCampaign({ ...newCampaign, stepId: e.target.value })}
                                placeholder="0"
                            />
                        </div>
                        <Button onClick={handleCreate} disabled={loading || !apiKey} className="w-full">
                            Launch Campaign
                        </Button>
                    </CardContent>
                </Card>

                {/* List */}
                <div className="md:col-span-2 space-y-4">
                    {campaigns.length === 0 && (
                        <Card className="border-dashed">
                            <CardContent className="pt-6 text-center text-muted-foreground">
                                No campaigns found. Create one or load with API Key.
                            </CardContent>
                        </Card>
                    )}
                    {campaigns.map(c => (
                        <Card key={c.id}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xl font-medium">
                                    {c.name}
                                </CardTitle>
                                <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                                    {c.status}
                                </Badge>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-muted-foreground mb-4">
                                    Funnel: {c.funnelId} | Step: {c.stepId}
                                </div>
                                <div className="flex gap-2">
                                    {/* Placeholder for future actions */}
                                    <Button variant="outline" className="text-sm py-1 px-3 h-auto">View Report</Button>
                                    <Button variant="ghost" className="text-sm py-1 px-3 h-auto">Pause</Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
