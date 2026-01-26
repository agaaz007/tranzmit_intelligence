"use client";

import { UploadCloud } from 'lucide-react';
import { useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface UploaderProps {
    onUpload: (content: any, fileName: string) => void;
    isAnalyzing: boolean;
    analyzingCount?: number;
}

export function Uploader({ onUpload, isAnalyzing, analyzingCount = 0 }: UploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const processFile = useCallback((file: File) => {
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    onUpload(json, file.name);
                } catch (error) {
                    console.error("Invalid JSON", error);
                    alert(`Invalid JSON file: ${file.name}`);
                }
            };
            reader.readAsText(file);
        }
    }, [onUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const jsonFiles = files.filter(f => f.type === 'application/json');
        
        if (jsonFiles.length === 0) {
            alert("Please upload valid JSON files");
            return;
        }

        jsonFiles.forEach(file => processFile(file));
    }, [processFile]);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => processFile(file));
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <Card
            className={cn(
                "border-2 border-dashed p-10 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900",
                isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-zinc-200 dark:border-zinc-800",
                isAnalyzing && "opacity-50 pointer-events-none"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                multiple
                className="hidden"
                onChange={handleFileChange}
            />
            <UploadCloud className="w-12 h-12 text-zinc-400 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Drag & Drop RRWeb JSON Files
            </h3>
            <p className="text-sm text-zinc-500 mt-2">
                Drop multiple files or click to browse
            </p>
            {isAnalyzing && analyzingCount > 0 && (
                <p className="text-sm text-blue-500 mt-3 font-medium">
                    Analyzing {analyzingCount} file{analyzingCount > 1 ? 's' : ''}...
                </p>
            )}
        </Card>
    );
}
