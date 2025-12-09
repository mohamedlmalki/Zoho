import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Eye, Download, Search, Loader2, BarChart3 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface ExpenseResult {
  rowNumber: number;
  primaryValue: string; // This corresponds to the bulk field value
  success: boolean;
  message: string;
  details?: string;
  recordId?: string;
  fullResponse?: any;
}

interface ExpenseResultsDisplayProps {
  results: ExpenseResult[];
  isProcessing: boolean;
  totalRows: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  bulkFieldName: string; // Pass the name of the field (e.g., "Merchant Name")
}

export const ExpenseResultsDisplay: React.FC<ExpenseResultsDisplayProps> = ({ 
  results, 
  isProcessing, 
  totalRows,
  filterText,
  onFilterTextChange,
  bulkFieldName
}) => {
  const filteredResults = useMemo(() => {
    if (!filterText) return results;
    return results.filter(r => 
      r.primaryValue.toLowerCase().includes(filterText.toLowerCase()) ||
      (r.details || '').toLowerCase().includes(filterText.toLowerCase()) ||
      (r.success ? 'success' : 'failed').includes(filterText.toLowerCase())
    );
  }, [results, filterText]);

  const completedCount = results.length;
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const progressPercent = totalRows > 0 ? (completedCount / totalRows) * 100 : 0;
  
  const handleExport = () => {
    const header = `Row,${bulkFieldName},Status,Record ID,Details\n`;
    const csvContent = filteredResults.map(r => {
      const status = r.success ? 'Success' : 'Failed';
      const details = (r.details || '').replace(/"/g, '""');
      const val = (r.primaryValue || '').replace(/"/g, '""');
      return `${r.rowNumber},"${val}",${status},${r.recordId || ''},"${details}"`;
    }).join('\n');

    const blob = new Blob([header + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `expense-results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  if (results.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300 mt-8">
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
          {isProcessing ? `Processing... ${completedCount} / ${totalRows} complete.` : 'Processing complete.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isProcessing && (
           <div className="w-full bg-muted rounded-full h-2 mb-6">
              <div 
                className="bg-gradient-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
        )}
        
        {results.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter results..."
                value={filterText}
                onChange={(e) => onFilterTextChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button variant="outline" onClick={handleExport} disabled={filteredResults.length === 0}>
              <Download className="h-4 w-4 mr-2"/>
              Export CSV
            </Button>
          </div>
        )}
        
        {results.length > 0 && (
          <ScrollArea className="h-[400px] w-full rounded-lg border">
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground w-16">Row</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">{bulkFieldName || 'Value'}</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Details</th>
                  <th className="p-3 text-center text-xs font-medium text-muted-foreground w-24">Data</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredResults.slice().reverse().map((result) => (
                  <tr key={result.rowNumber} className={!result.success ? 'bg-destructive/5' : ''}>
                    <td className="p-3 text-sm font-mono text-muted-foreground">{result.rowNumber}</td>
                    <td className="p-3 text-sm font-mono font-medium">{result.primaryValue}</td>
                    <td className="p-3">
                        {result.success ? 
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Success</Badge> : 
                            <Badge variant="destructive">Failed</Badge>
                        }
                    </td>
                    <td className="p-3 text-sm text-muted-foreground max-w-xs truncate" title={result.details}>
                        {result.details}
                    </td>
                    
                    <td className="p-3 text-center">
                       <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-4 w-4" /></Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>API Response (Row {result.rowNumber})</DialogTitle>
                            </DialogHeader>
                            <pre className="mt-2 max-h-[60vh] overflow-y-auto rounded-md bg-muted p-4 text-xs font-mono">
                              {JSON.stringify(result.fullResponse || {}, null, 2)}
                            </pre>
                          </DialogContent>
                        </Dialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};