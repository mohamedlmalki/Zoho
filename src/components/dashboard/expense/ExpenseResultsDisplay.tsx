import React, { useMemo } from 'react';
import { ColumnDef, getCoreRowModel, useReactTable, flexRender, getPaginationRowModel, getFilteredRowModel } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ExternalLink, Pause, Play, StopCircle, Filter, Loader2, RefreshCw } from 'lucide-react';
import { ExpenseJobState, ExpenseResult } from '@/App';
import { ExportButton } from '../ExportButton'; 
import { Input } from '@/components/ui/input';
import { Socket } from 'socket.io-client';

interface ExpenseResultsDisplayProps {
  selectedProfileName: string;
  jobs: { [key: string]: ExpenseJobState };
  socket: Socket | null;
  setJobs: React.Dispatch<React.SetStateAction<{ [key: string]: ExpenseJobState }>>;
}

export const ExpenseResultsDisplay: React.FC<ExpenseResultsDisplayProps> = ({ selectedProfileName, jobs, socket, setJobs }) => {
  const jobState = jobs[selectedProfileName];
  const results: ExpenseResult[] = jobState?.results || [];

  const columns: ColumnDef<ExpenseResult>[] = useMemo(() => [
    {
      accessorKey: 'primaryValue',
      header: 'Primary Value',
      cell: ({ row }) => {
        const value = row.original.primaryValue || 'N/A';
        return <span className="font-medium">{value}</span>;
      },
    },
    {
      accessorKey: 'finalStatus',
      header: 'Final Status',
      cell: ({ row }) => {
        const finalStatus = row.original.finalStatus;
        const success = row.original.success;

        let badgeVariant: 'success' | 'destructive' | 'default' = 'default';
        let text = finalStatus;

        if (finalStatus.includes('Pending')) {
            badgeVariant = 'default';
            text = 'Pending Check...';
        } else if (success) {
            // Note: success in the result means the API call succeeded, but 'finalStatus' confirms inspection result
            badgeVariant = 'success';
            text = finalStatus.includes('Verified') ? 'Verified' : 'Created';
        } else {
            badgeVariant = 'destructive';
            text = finalStatus.includes('Rejected') ? 'Rejected' : 'Failed';
        }

        return <Badge variant={badgeVariant} className="min-w-[120px] justify-center">{text}</Badge>;
      },
    },
    {
      accessorKey: 'recordId',
      header: 'Record ID',
      cell: ({ row }) => {
        const recordId = row.original.recordId;
        const module = jobState?.formData?.selectedModuleApiName;
        
        if (!recordId) return 'N/A';
        
        // Link template for Zoho Expense (example)
        const link = `https://expense.zoho.com/app/#/home/${module}/${recordId}`; 
        
        return (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
            {recordId.substring(0, 8)}... <ExternalLink className="inline h-3 w-3 ml-1" />
          </a>
        );
      },
    },
    {
      accessorKey: 'details',
      header: 'Details',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-sm block truncate" title={row.original.details || row.original.error}>
          {row.original.details || row.original.error || 'N/A'}
        </span>
      ),
    },
  ], [jobState]);

  const table = useReactTable({
    data: results,
    columns,
    state: {
      globalFilter: jobState?.filterText || '',
      pagination: {
        pageIndex: 0,
        pageSize: 100,
      }
    },
    onGlobalFilterChange: (updater) => {
        const filterValue = typeof updater === 'function' ? updater(jobState.filterText) : updater;
        setJobs(prev => jobState ? ({ 
            ...prev, 
            [selectedProfileName]: { ...jobState, filterText: filterValue } 
        }) : prev);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!jobState) return null;

  const handlePause = () => {
    if (socket) {
      socket.emit('pauseJob', { profileName: selectedProfileName, jobType: 'expense' });
      setJobs(prev => ({ ...prev, [selectedProfileName]: { ...jobState, isPaused: true } }));
    }
  };

  const handleResume = () => {
    if (socket) {
      socket.emit('resumeJob', { profileName: selectedProfileName, jobType: 'expense' });
      setJobs(prev => ({ ...prev, [selectedProfileName]: { ...jobState, isPaused: false, isProcessing: true } }));
    }
  };

  const handleEnd = () => {
    if (socket) {
      socket.emit('endJob', { profileName: selectedProfileName, jobType: 'expense' });
      setJobs(prev => ({ ...prev, [selectedProfileName]: { ...jobState, isProcessing: false } }));
    }
  };
  
  const totalProcessed = results.length;
  const totalToProcess = jobState.totalToProcess;
  const progressValue = totalProcessed > 0 ? (totalProcessed / totalToProcess) * 100 : 0;
  
  const successfulRecords = results.filter(r => r.success && !r.finalStatus.includes('Failed')).length;
  const failedRecords = results.filter(r => !r.success || r.finalStatus.includes('Failed') || r.finalStatus.includes('Rejected')).length;
  const pendingRecords = results.filter(r => r.finalStatus.includes('Pending')).length;

  return (
    <Card className="mt-6 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>Expense Bulk Job Results ({selectedProfileName})</CardTitle>
          <CardDescription>
            Real-time status of {jobState.formData.selectedModuleApiName} record creation.
          </CardDescription>
        </div>
        <div className="flex space-x-2">
            <ExportButton 
                data={results} 
                fileName={`ZohoExpense_Bulk_${selectedProfileName}_${jobState.formData.selectedModuleApiName}.csv`}
            />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-2">
          {/* Progress Bar */}
          <div className="flex justify-between items-center text-sm font-medium">
            <span>Progress: {totalProcessed} / {totalToProcess}</span>
            <span>{progressValue.toFixed(0)}% Complete</span>
          </div>
          <Progress value={progressValue} className="w-full" />
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-4 gap-4 text-center mb-6 text-sm">
            <div className="p-2 border rounded-lg bg-green-50 text-green-700">
                <p className="text-xl font-bold">{successfulRecords}</p>
                <p>Success</p>
            </div>
            <div className="p-2 border rounded-lg bg-red-50 text-red-700">
                <p className="text-xl font-bold">{failedRecords}</p>
                <p>Failed / Rejected</p>
            </div>
            <div className="p-2 border rounded-lg bg-blue-50 text-blue-700">
                <p className="text-xl font-bold">{pendingRecords}</p>
                <p>Pending Check</p>
            </div>
            <div className="p-2 border rounded-lg bg-yellow-50 text-yellow-700">
                <p className="text-xl font-bold">{jobState.processingTime.toFixed(1)}s</p>
                <p>Time Elapsed</p>
            </div>
        </div>

        {/* Job Controls */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
                {jobState.isProcessing && !jobState.isPaused && (
                    <Button onClick={handlePause} variant="secondary">
                        <Pause className="h-4 w-4 mr-2" /> Pause Job
                    </Button>
                )}
                {jobState.isPaused && (
                    <Button onClick={handleResume} variant="default">
                        <Play className="h-4 w-4 mr-2" /> Resume Job
                    </Button>
                )}
                {(jobState.isProcessing || jobState.isPaused) && (
                    <Button onClick={handleEnd} variant="destructive">
                        <StopCircle className="h-4 w-4 mr-2" /> End Job
                    </Button>
                )}
                {!jobState.isProcessing && !jobState.isComplete && (
                     <Button variant="outline" disabled>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting to start
                     </Button>
                )}
                {jobState.isComplete && (
                     <Button variant="outline" disabled>
                        Job Complete!
                     </Button>
                )}
            </div>
            {jobState.isProcessing && (
                <span className="text-sm font-medium flex items-center">
                    Next in: <span className="text-lg font-bold ml-1 w-6 text-center">{jobState.countdown}</span>s
                </span>
            )}
        </div>
        
        {/* Filter Input */}
        <div className="flex items-center py-4">
          <Input
            placeholder="Filter results by primary value, status, or details..."
            value={jobState.filterText}
            onChange={(event) => {
                 setJobs(prev => ({ 
                    ...prev, 
                    [selectedProfileName]: { ...jobState, filterText: event.target.value } 
                }));
            }}
            className="max-w-sm"
          />
        </div>

        {/* Results Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow 
                    key={row.id}
                    // Conditional Row Coloring (Desk-like logic)
                    className={
                        row.original.finalStatus === 'Pending Inspection' 
                            ? 'bg-yellow-50/50 hover:bg-yellow-100/50' 
                        : row.original.success && row.original.finalStatus.includes('Verified') 
                            ? 'bg-green-50/50 hover:bg-green-100/50' 
                        : !row.original.success || row.original.finalStatus.includes('Failed') || row.original.finalStatus.includes('Rejected')
                            ? 'bg-red-50/50 hover:bg-red-100/50'
                        : ''
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {jobState.isProcessing ? 'Processing first records...' : 'No results found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls - Simple (can be expanded using DataTablePagination if needed) */}
        <div className="flex items-center justify-end space-x-2 py-4">
            <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
            >
                Previous
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
            >
                Next
            </Button>
        </div>
      </CardContent>
    </Card>
  );
};