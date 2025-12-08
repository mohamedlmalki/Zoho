// --- FILE: src/components/dashboard/qntrl/QntrlResultsDisplay.tsx (REWRITTEN) ---
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Eye, Hash, Mail, Clock, BarChart3, Download, Search } from 'lucide-react';
import { QntrlResult } from '@/App';

interface ResultsDisplayProps {
  job: {
    results: QntrlResult[];
    isProcessing: boolean;
    isComplete: boolean;
    totalToProcess: number;
    countdown: number;
    filterText: string;
  };
}

export const QntrlResultsDisplay: React.FC<ResultsDisplayProps> = ({ job }) => {
  const { results, isProcessing, isComplete, totalToProcess, countdown, filterText } = job;
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [localFilterText, setLocalFilterText] = useState(filterText);

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      // 1. Text Filter
      const matchesText = !localFilterText || (
        (r.primaryValue || '').toLowerCase().includes(localFilterText.toLowerCase()) ||
        (r.details || '').toLowerCase().includes(localFilterText.toLowerCase()) ||
        (r.error || '').toLowerCase().includes(localFilterText.toLowerCase()) ||
        (r.success ? 'success' : 'failed').includes(localFilterText.toLowerCase())
      );

      // 2. Status Filter
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'success' ? r.success :
        !r.success; 

      return matchesText && matchesStatus;
    });
  }, [results, localFilterText, statusFilter]);

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const progressPercent = totalToProcess > 0 ? (results.length / totalToProcess) * 100 : 0;

  const handleExport = () => {
    // Only export the primary value, one per line (like in Creator/Desk updates)
    const content = filteredResults.map(r => r.primaryValue).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    // Naming logic based on filter
    const filename = statusFilter === 'all' ? 'qntrl-cards-all.txt' : 
                     statusFilter === 'success' ? 'qntrl-cards-success.txt' : 'qntrl-cards-failed.txt';

    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to format time as H:M (e.g., 14:05)
  const formatTime = (dateInput?: Date | string) => {
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
    <Card className="shadow-medium hover:shadow-large transition-all duration-300 mt-6">
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
          {isProcessing ? 'Creating cards in real-time...' : 
           isComplete ? `All ${totalToProcess} cards have been processed.` : 
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
                    Next card in {countdown}s
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
                    placeholder="Search results..."
                    value={localFilterText}
                    onChange={(e) => setLocalFilterText(e.target.value)}
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
                        <span>Primary Value</span>
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
                  {filteredResults.slice().reverse().map((result, index) => (
                    <tr 
                      key={index}
                      className={`transition-colors hover:bg-muted/30 ${
                        result.success ? 'bg-success/5' : 'bg-destructive/5'
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-center text-muted-foreground font-mono">
                        {filteredResults.length - index}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {result.primaryValue}
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
                        {formatTime(result.timestamp)}
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
                              <DialogTitle>
                                Full Response - {result.primaryValue}
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
                  ))}
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

        {isComplete && (
          <div className="mt-6 p-4 bg-gradient-success rounded-lg border border-success/20">
            <div className="flex items-center justify-center space-x-2 text-success-foreground">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Processing Complete!</span>
            </div>
            <p className="text-center text-sm text-success-foreground/80 mt-1">
              Successfully processed {successCount} out of {totalToProcess} cards
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};