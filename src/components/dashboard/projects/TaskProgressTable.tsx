// --- FILE: src/components/dashboard/projects/TaskProgressTable.tsx (CORRECTED) ---
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, XCircle, Loader2, Eye, Play, Pause, Square, Trash2 } from 'lucide-react';
import { TaskProgressState, TaskLogResult } from './ProjectsDataTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExportButton } from '../ExportButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

interface TaskProgressTableProps {
  jobState?: TaskProgressState; // Make jobState optional
  onClear: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
}

const JobControls: React.FC<{
  isProcessing: boolean; isPaused: boolean; isComplete: boolean;
  onPause: () => void; onResume: () => void; onEnd: () => void; onClear: () => void;
}> = ({ isProcessing, isPaused, isComplete, onPause, onResume, onEnd, onClear }) => (
  <div className="flex items-center space-x-2">
    {isProcessing && !isPaused && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={onPause}><Pause className="h-4 w-4" /></Button>
        </TooltipTrigger>
        <TooltipContent><p>Pause Job</p></TooltipContent>
      </Tooltip>
    )}
    {isProcessing && isPaused && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={onResume}><Play className="h-4 w-4" /></Button>
        </TooltipTrigger>
        <TooltipContent><p>Resume Job</p></TooltipContent>
      </Tooltip>
    )}
    {isProcessing && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="destructive" size="icon" onClick={onEnd}><Square className="h-4 w-4" /></Button>
        </TooltipTrigger>
        <TooltipContent><p>End Job</p></TooltipContent>
      </Tooltip>
    )}
    {isComplete && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={onClear}><Trash2 className="h-4 w-4" /></Button>
        </TooltipTrigger>
        <TooltipContent><p>Clear Log</p></TooltipContent>
      </Tooltip>
    )}
  </div>
);


export const TaskProgressTable: React.FC<TaskProgressTableProps> = ({ 
  // --- THIS IS THE FIX: Provide a default value for jobState ---
  jobState = {
    results: [],
    isProcessing: false,
    isPaused: false,
    isComplete: false,
    processingTime: 0,
    totalToProcess: 0,
    countdown: 0,
    filterText: '',
    formData: {
      taskNames: '',
      taskDescription: '',
      projectId: '',
      tasklistId: '',
      delay: 1,
      emails: '',
      custom_fields: {},
    }
  },
  // --- END OF FIX ---
  onClear,
  onPause,
  onResume,
  onEnd
}) => {
  const [modalData, setModalData] = useState<any | null>(null);

  // These are now safe because jobState has a default
  const isProcessing = jobState.isProcessing || jobState.isPaused;
  const isComplete = jobState.isComplete;

  const currentStatus: TaskLogResult[] = useMemo(() => {
    // This line is now safe
    const results = [...(jobState.results || [])]; 
    if (isProcessing && results.length < jobState.totalToProcess) {
      const remainingCount = jobState.totalToProcess - results.length;
      results.push({
        projectName: `Processing Next (${remainingCount} remaining)...`,
        success: false,
        details: jobState.isPaused ? 'Paused' : `Countdown: ${jobState.countdown}s`,
        fullResponse: null,
      });
    }
    return results.reverse();
  }, [jobState.results, jobState.totalToProcess, jobState.isProcessing, jobState.isPaused, jobState.countdown]);


  const columns: ColumnDef<TaskLogResult>[] = useMemo(() => [
    {
      id: 'number',
      header: '#',
      cell: ({ row, table }) => {
        const totalRows = table.getCoreRowModel().rows.length;
        return totalRows - row.index;
      },
      size: 40,
    },
    {
      accessorKey: 'success',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.details?.startsWith('Countdown')) {
             return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
        }
        if (row.original.details === 'Paused') {
            return <Badge variant="secondary">Paused</Badge>;
        }
        return row.original.success ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        );
      },
      size: 50,
    },
    {
      accessorKey: 'projectName',
      header: 'Task Name',
      cell: ({ row }) => (
        <div className="font-medium text-sm">
            {row.original.projectName}
        </div>
      ),
      size: 300,
    },
    {
      accessorKey: 'details',
      header: 'Details',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.details || row.original.error || 'Processing...'}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const { fullResponse, error } = row.original;
        const responseToShow = fullResponse || (error ? { errorDetails: error } : null);
        
        if (!responseToShow) {
          return null;
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setModalData(responseToShow)}>
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>View Full Response</p></TooltipContent>
          </Tooltip>
        );
      },
      size: 50,
    }
  ], []);

  const progressPercent = (jobState.totalToProcess || 0) > 0 
    ? ((jobState.results?.length || 0) / jobState.totalToProcess) * 100 
    : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Bulk Job Progress</CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2 sm:mt-0">
              <JobControls
                isProcessing={isProcessing}
                isPaused={jobState.isPaused}
                isComplete={isComplete}
                onPause={onPause}
                onResume={onResume}
                onEnd={onEnd}
                onClear={onClear}
              />
              <ExportButton
                results={jobState.results || []}
                filename="task_bulk_results.csv"
              />
            </div>
          </div>
          
          {(isProcessing || isComplete) && (
            <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{jobState.results?.length || 0} / {jobState.totalToProcess || 0} tasks</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
            </div>
          )}

        </CardHeader>
        <CardContent>
          
          {isProcessing || isComplete ? (
            <DataTable 
                columns={columns} 
                data={currentStatus} 
                filterColumnId="projectName" 
                filterPlaceholder="Filter task names..."
            />
          ) : (
            <p className="text-sm text-muted-foreground p-4">
              Start a bulk job to see real-time progress here.
            </p>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={!!modalData} onOpenChange={(isOpen) => !isOpen && setModalData(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Full API Response</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-[60vh] overflow-y-auto">
            {JSON.stringify(modalData, null, 2)}
          </pre>
          <DialogFooter>
            <Button onClick={() => setModalData(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};