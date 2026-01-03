// --- FILE: src/components/dashboard/people/PeopleResultsDisplay.tsx ---
import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    CheckCircle2, XCircle, Eye, Hash, Mail, Clock, BarChart3, 
    Download, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight 
} from 'lucide-react';
import { PeopleResult } from '@/App';

interface ResultsDisplayProps {
  results: PeopleResult[];
  isProcessing: boolean;
  isComplete: boolean;
  totalToProcess: number;
  countdown: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  primaryFieldLabel: string;
}

const ITEMS_PER_PAGE = 100;

export const PeopleResultsDisplay: React.FC<ResultsDisplayProps> = ({ 
  results, 
  isProcessing, 
  isComplete,
  totalToProcess,
  countdown,
  filterText,
  onFilterTextChange,
  primaryFieldLabel
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // --- Filter Logic ---
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      // 1. Text Filter
      const matchesText = !filterText || (
        (r.email || '').toLowerCase().includes(filterText.toLowerCase()) || 
        (r.details || '').toLowerCase().includes(filterText.toLowerCase()) ||
        (r.error || '').toLowerCase().includes(filterText.toLowerCase()) ||
        (r.success ? 'success' : 'failed').includes(filterText.toLowerCase())
      );

      // 2. Status Filter
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'success' ? r.success :
        !r.success; 

      return matchesText && matchesStatus;
    });
  }, [results, filterText, statusFilter]);

  // --- Pagination Logic ---
  // Reverse logic: Show newest items (end of array) first
  const reversedFilteredResults = useMemo(() => {
    return [...filteredResults].reverse();
  }, [filteredResults]);

  const totalPages = Math.ceil(reversedFilteredResults.length / ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, statusFilter]);

  // Slice data for the current page
  const currentData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return reversedFilteredResults.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [reversedFilteredResults, currentPage]);
  // ------------------------

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const progressPercent = totalToProcess > 0 ? (results.length / totalToProcess) * 100 : 0;

  const handleExport = () => {
    const content = filteredResults.map(r => r.email).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const filename = statusFilter === 'all' ? 'people-records-all.txt' : 
                     statusFilter === 'success' ? 'people-records-success.txt' : 'people-records-failed.txt';

    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (result: any) => {
    const dateInput = result.timestamp;
    if (!dateInput) return '-';
    const date = new Date(dateInput);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  if (results.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Processing Results</CardTitle>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="success" className="bg-success/10 text-success">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {successCount} Success
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive" className="bg-destructive/10">
                <XCircle className="h-3 w-3 mr-1" />
                {errorCount} Errors
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {isProcessing ? 'Importing records in real-time...' : 
           isComplete ? `All ${totalToProcess} records have been processed.` : 
           'View results below.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {(isProcessing || (isComplete && results.length > 0)) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">Progress</span>
              <div className="flex items-center space-x-2">
                {isProcessing && countdown > 0 && (
                  <Badge variant="outline" className="font-mono">
                    <Clock className="h-3 w-3 mr-1" />
                    Next record in {countdown}s
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">{results.length} / {totalToProcess} processed</span>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-gradient-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
        
        {results.length > 0 && (
          <div className="space-y-4 mb-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <Tabs 
                value={statusFilter} 
                onValueChange={(v) => setStatusFilter(v as 'all' | 'success' | 'failed')}
                className="w-full md:w-auto"
              >
                <TabsList>
                  <TabsTrigger value="all">All ({results.length})</TabsTrigger>
                  <TabsTrigger value="success">Success ({successCount})</TabsTrigger>
                  <TabsTrigger value="failed">Failed ({errorCount})</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${primaryFieldLabel}...`}
                    value={filterText}
                    onChange={(e) => onFilterTextChange(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={handleExport} disabled={filteredResults.length === 0}>
                  <Download className="h-4 w-4 mr-2"/>
                  Export TXT ({filteredResults.length})
                </Button>
              </div>
            </div>
          </div>
        )}

        {filteredResults.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-12">
                      <Hash className="h-4 w-4" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div className="flex items-center space-x-1">
                        <Mail className="h-4 w-4" />
                        <span>{primaryFieldLabel}</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                      Time
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {currentData.map((result, index) => {
                    // Correct index calculation for pagination + reverse logic
                    const actualIndex = filteredResults.length - ((currentPage - 1) * ITEMS_PER_PAGE + index);

                    return (
                        <tr 
                        key={`${result.email}-${index}`}
                        className={`transition-colors hover:bg-muted/30 ${
                            result.success ? 'bg-success/5' : 'bg-destructive/5'
                        }`}
                        >
                        <td className="px-4 py-3 text-sm text-center text-muted-foreground font-mono">
                            {actualIndex}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                            {result.email}
                        </td>
                        <td className="px-4 py-3">
                            {result.success ? (
                            <Badge variant="success" className="bg-success/10 text-success">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Success
                            </Badge>
                            ) : (
                            <Badge variant="destructive" className="bg-destructive/10">
                                <XCircle className="h-3 w-3 mr-1" />
                                Failed
                            </Badge>
                            )}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">
                            <span className={!result.success ? "text-destructive font-medium" : "font-medium"}>
                            {result.details || result.error}
                            </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-muted-foreground font-mono">
                            {formatTime(result)}
                        </td>
                        <td className="px-4 py-3 text-center">
                            <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <Eye className="h-3 w-3" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl bg-card border-border shadow-large">
                                <DialogHeader>
                                <DialogTitle className="flex items-center space-x-2">
                                    <Eye className="h-4 w-4" />
                                    <span>
                                    {result.success 
                                        ? `Full Response - ${result.email}`
                                        : `Error Response - ${result.email}`
                                    }
                                    </span>
                                </DialogTitle>
                                </DialogHeader>
                                <div className="max-h-[60vh] overflow-y-auto p-1">
                                <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">
                                    {JSON.stringify(result.fullResponse, null, 2)}
                                </pre>
                                </div>
                            </DialogContent>
                            </Dialog>
                        </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          results.length > 0 && (
            <div className="p-8 text-center border border-dashed border-border rounded-lg bg-muted/20">
              <p className="text-muted-foreground">No results match your current filters.</p>
            </div>
          )
        )}

        {/* --- Pagination Controls --- */}
        {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 pt-4">
                <div className="text-xs text-muted-foreground">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredResults.length)} of {filteredResults.length} entries
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center text-sm font-medium w-[80px]">
                        Page {currentPage} / {totalPages}
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )}

        {isComplete && (
          <div className="mt-6 p-4 bg-gradient-success rounded-lg border border-success/20">
            <div className="flex items-center justify-center space-x-2 text-success-foreground">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Processing Complete!</span>
            </div>
            <p className="text-center text-sm text-success-foreground/80 mt-1">
              Successfully processed {successCount} out of {totalToProcess} records
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};