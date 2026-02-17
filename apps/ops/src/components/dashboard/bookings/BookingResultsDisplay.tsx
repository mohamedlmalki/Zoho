// --- FILE: src/components/dashboard/bookings/BookingResultsDisplay.tsx ---

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
    CheckCircle2, XCircle, Eye, Hash, Mail, Clock, Calendar,
    Download, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Timer, ListTodo
} from 'lucide-react';

export interface BookingResult {
    email: string;
    success: boolean;
    time: string;
    details?: string;
    error?: string;
    fullResponse?: any;
}

interface BookingResultsDisplayProps {
  results: BookingResult[];
  isProcessing: boolean;
  totalToProcess: number;
  processingTime?: number; // Added prop for time
}

const ITEMS_PER_PAGE = 100;

export const BookingResultsDisplay: React.FC<BookingResultsDisplayProps> = ({ 
    results, isProcessing, totalToProcess, processingTime = 0 
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedResult, setSelectedResult] = useState<BookingResult | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => { setCurrentPage(1); }, [filterText, statusFilter]);

  // Calculations
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const remaining = Math.max(0, totalToProcess - results.length);
  const progressPercent = totalToProcess > 0 ? (results.length / totalToProcess) * 100 : 0;

  // Format Timer (seconds -> MM:SS)
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filter Data
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      const search = filterText.toLowerCase();
      const matchesText = !filterText || (
        r.email.toLowerCase().includes(search) ||
        (r.details && r.details.toLowerCase().includes(search)) ||
        (r.error && r.error.toLowerCase().includes(search))
      );
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'success' ? r.success :
        !r.success; 
      return matchesText && matchesStatus;
    });
  }, [results, filterText, statusFilter]);

  // Pagination
  const reversedData = useMemo(() => [...filteredResults].reverse(), [filteredResults]);
  const totalPages = Math.ceil(reversedData.length / ITEMS_PER_PAGE);
  const currentData = useMemo(() => {
    const startIndex = (Math.max(1, currentPage) - 1) * ITEMS_PER_PAGE;
    return reversedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [reversedData, currentPage]);

  const handleExport = () => {
    const content = filteredResults.map(r => `${r.email},${r.time},${r.success?'SUCCESS':'FAILED'},"${r.details||r.error}"`).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bookings-${statusFilter}.csv`;
    link.click();
  };

  if (results.length === 0 && !isProcessing) return null;

  return (
    <Card className="shadow-medium h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Results</CardTitle>
          </div>
          {/* STATS BADGES */}
          <div className="flex gap-3 text-xs font-medium">
             <div className="flex items-center px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Success: {successCount}
             </div>
             <div className="flex items-center px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">
                <XCircle className="h-3 w-3 mr-1" /> Failed: {errorCount}
             </div>
             <div className="flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                <ListTodo className="h-3 w-3 mr-1" /> Remain: {remaining}
             </div>
             <div className="flex items-center px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 min-w-[80px] justify-center">
                <Timer className="h-3 w-3 mr-1" /> {formatTime(processingTime)}
             </div>
          </div>
        </div>
        
        {/* PROGRESS BAR */}
        <div className="mt-2 space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground uppercase">
                <span>Progress</span>
                <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden">
        {/* FILTERS */}
        <div className="space-y-4 mb-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full md:w-auto">
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="success">Success</TabsTrigger>
                        <TabsTrigger value="failed">Failed</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-48">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search..." value={filterText} onChange={(e) => setFilterText(e.target.value)} className="pl-10 h-9" />
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredResults.length===0}>
                        <Download className="h-4 w-4"/>
                    </Button>
                </div>
            </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto rounded-md border border-border">
            <table className="w-full">
                <thead className="bg-muted/50 border-b border-border sticky top-0">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-12"><Hash className="h-3 w-3"/></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"><Mail className="h-3 w-3 inline mr-1"/>Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"><Clock className="h-3 w-3 inline mr-1"/>Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-24">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Details</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground w-16">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                    {currentData.map((result, idx) => {
                        const realIndex = reversedData.length - ((Math.max(1, currentPage) - 1) * ITEMS_PER_PAGE + idx);
                        return (
                            <tr key={idx} className={`hover:bg-muted/30 ${result.success ? 'bg-green-50/20' : 'bg-red-50/20'}`}>
                                <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{realIndex}</td>
                                <td className="px-4 py-2 text-sm font-medium">{result.email}</td>
                                <td className="px-4 py-2 text-xs font-mono">{result.time}</td>
                                <td className="px-4 py-2">
                                    {result.success ? 
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Success</Badge> : 
                                        <Badge variant="destructive" className="text-red-600 border-red-200 bg-red-50">Failed</Badge>
                                    }
                                </td>
                                <td className="px-4 py-2 text-xs truncate max-w-[200px]" title={result.details || result.error}>
                                    {result.details || result.error}
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {setSelectedResult(result); setIsDialogOpen(true);}}>
                                        <Eye className="h-3 w-3"/>
                                    </Button>
                                </td>
                            </tr>
                        );
                    })}
                    {currentData.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No results found.</td></tr>
                    )}
                </tbody>
            </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
                <div className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</div>
                <div className="flex space-x-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(1)} disabled={currentPage===1}><ChevronsLeft className="h-3 w-3"/></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p=>p-1)} disabled={currentPage===1}><ChevronLeft className="h-3 w-3"/></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(p=>p+1)} disabled={currentPage===totalPages}><ChevronRight className="h-3 w-3"/></Button>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage(totalPages)} disabled={currentPage===totalPages}><ChevronsRight className="h-3 w-3"/></Button>
                </div>
            </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{selectedResult?.success ? 'Success' : 'Error'}</DialogTitle>
                <DialogDescription>{selectedResult?.email}</DialogDescription>
            </DialogHeader>
            <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-auto text-xs font-mono border border-slate-800">
                <pre>{JSON.stringify(selectedResult?.fullResponse || selectedResult, null, 2)}</pre>
            </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};