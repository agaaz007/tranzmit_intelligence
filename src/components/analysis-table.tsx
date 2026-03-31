"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Trash2, Loader2 } from "lucide-react";

export interface AnalysisEntry {
    id: string;
    fileName: string;
    timestamp: string;
    analysis: any;
    events: any[];
    isAnalyzing?: boolean;
}

interface AnalysisTableProps {
    analyses: AnalysisEntry[];
    selectedId?: string | null;
    onView: (entry: AnalysisEntry | null) => void;
    onDelete?: (id: string) => void;
}

export function AnalysisTable({ analyses, selectedId, onView, onDelete }: AnalysisTableProps) {
    if (!analyses || analyses.length === 0) return null;

    const handleToggleView = (entry: AnalysisEntry) => {
        if (selectedId === entry.id) {
            // Collapse if already selected
            onView(null);
        } else {
            // Expand this entry
            onView(entry);
        }
    };

    return (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--card)]">
            <Table>
                <TableHeader>
                    <TableRow className="bg-[var(--muted)]/50">
                        <TableHead className="w-[180px]">File</TableHead>
                        <TableHead className="w-[100px]">Time</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="w-[200px]">Tags</TableHead>
                        <TableHead className="w-[100px]">UX Rating</TableHead>
                        <TableHead className="w-[140px]">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {analyses.map((entry) => {
                        const isSelected = selectedId === entry.id;
                        return (
                            <TableRow 
                                key={entry.id}
                                className={`cursor-pointer hover:bg-[var(--muted)]/40 ${entry.isAnalyzing ? 'opacity-60' : ''} ${isSelected ? 'bg-[var(--brand-light)]' : ''}`}
                                onClick={() => !entry.isAnalyzing && entry.analysis && handleToggleView(entry)}
                            >
                                <TableCell className="font-medium truncate max-w-[180px]" title={entry.fileName}>
                                    {entry.fileName}
                                </TableCell>
                                <TableCell className="text-[var(--muted-foreground)] text-sm">{entry.timestamp}</TableCell>
                                <TableCell className="max-w-md truncate">
                                    {entry.isAnalyzing ? (
                                        <span className="flex items-center gap-2 text-[var(--brand-primary)]">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Analyzing...
                                        </span>
                                    ) : (
                                        entry.analysis?.summary || '—'
                                    )}
                                </TableCell>
                                <TableCell>
                                    {!entry.isAnalyzing && entry.analysis?.tags && (
                                        <div className="flex gap-1 flex-wrap">
                                            {entry.analysis.tags.slice(0, 3).map((tag: string) => (
                                                <Badge key={tag} variant="secondary" className="text-xs">
                                                    {tag}
                                                </Badge>
                                            ))}
                                            {entry.analysis.tags.length > 3 && (
                                                <Badge variant="outline" className="text-xs">
                                                    +{entry.analysis.tags.length - 3}
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {!entry.isAnalyzing && entry.analysis && (
                                        <Badge variant={entry.analysis.ux_rating > 7 ? "default" : entry.analysis.ux_rating > 4 ? "secondary" : "destructive"}>
                                            {entry.analysis.ux_rating}/10
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        <Button 
                                            variant={isSelected ? "secondary" : "ghost"}
                                            size="sm" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!entry.isAnalyzing && entry.analysis) handleToggleView(entry);
                                            }}
                                            disabled={entry.isAnalyzing || !entry.analysis}
                                            title={isSelected ? "Hide details" : "View details"}
                                        >
                                            {isSelected ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </Button>
                                        {onDelete && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDelete(entry.id);
                                                }}
                                                className="text-[var(--muted-foreground)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
