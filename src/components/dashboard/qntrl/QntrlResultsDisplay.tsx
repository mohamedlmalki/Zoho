import React, { useMemo, useState } from 'react';
import { QntrlJobs } from '@/App';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Eye, Hash } from 'lucide-react';
import { ExportButton } from '../ExportButton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type QntrlResult = QntrlJobs[string]['results'][0];

interface QntrlResultsDisplayProps {
  job: QntrlJobs[string];
}

export const QntrlResultsDisplay: React.FC<QntrlResultsDisplayProps> = ({ job }) => {
  const { results, filterText } = job;

  // --- MODIFICATION: Added Row Number and Action Columns ---
  const columns: ColumnDef<QntrlResult>[] = useMemo(() => [
    {
      id: 'number',
      header: () => <Hash className="h-4 w-4" />,
      cell: ({ row, table }) => {
        // --- MODIFICATION: Calculate reversed row number ---
        const originalRows = table.getCoreRowModel().rows;
        const reversedIndex = originalRows.length - row.index;
        return <span className="font-mono text-muted-foreground">{reversedIndex}</span>;
      },
      size: 40,
    },
    {
      accessorKey: 'primaryValue',
      header: 'Primary Value',
      cell: ({ row }) => <span className="font-mono">{row.original.primaryValue}</span>,
    },
    {
      accessorKey: 'success',
      header: 'Status',
      cell: ({ row }) =>
        row.original.success ? (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="mr-2 h-4 w-4" /> Success
          </Badge>
        ) : (
          <Badge variant="destructive">
            <AlertCircle className="mr-2 h-4 w-4" /> Failed
          </Badge>
        ),
      size: 120,
    },
    {
      accessorKey: 'details',
      header: 'Details',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.success ? (
            <span>Card ID: <span className="font-mono">{row.original.details}</span></span>
          ) : (
            <span className="text-red-600">{row.original.error}</span>
          )}
        </div>
      ),
    },
    // --- MODIFICATION: Added Action "Eye" Button Column ---
    {
      id: 'actions',
      header: 'Action',
      size: 80,
      cell: ({ row }) => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Eye className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Full API Response</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md bg-muted p-4">
              <pre className="text-xs font-mono">
                {JSON.stringify(row.original.fullResponse, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      ),
    }
  ], []);
  // --- END MODIFICATION ---

  const filteredResults = useMemo(() =>
    results.filter(r => 
      (r.primaryValue?.toLowerCase() || '').includes(filterText.toLowerCase()) ||
      (r.details?.toLowerCase() || '').includes(filterText.toLowerCase()) ||
      (r.error?.toLowerCase() || '').includes(filterText.toLowerCase())
    )
  , [results, filterText]);

  // --- MODIFICATION: Reverse the results for display ---
  const reversedResults = useMemo(() => filteredResults.slice().reverse(), [filteredResults]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Results</CardTitle>
          {results.length > 0 && <ExportButton results={results} filename="qntrl-card-results.csv" />}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable 
          columns={columns} 
          data={reversedResults} // Use the reversed results
          filterColumn="primaryValue" 
          filterPlaceholder="Filter by value..." 
        />
      </CardContent>
    </Card>
  );
};