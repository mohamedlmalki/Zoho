// --- FILE: src/components/dashboard/meeting/WebinarResultsDisplay.tsx (MODIFIED) ---
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { WebinarResult, WebinarJobState } from '@/App';
import { ExportButton } from '../ExportButton';
import { Progress } from '@/components/ui/progress';

interface WebinarResultsDisplayProps {
  results: WebinarResult[];
  isProcessing: boolean;
  isComplete: boolean;
  totalItems: number;
  countdown: number;
  filterText: string;
  onFilterTextChange: (text: string) => void;
}

export const WebinarResultsDisplay: React.FC<WebinarResultsDisplayProps> = ({
  results,
  isProcessing,
  isComplete,
  totalItems,
  countdown,
  filterText,
  onFilterTextChange,
}) => {
  const filteredResults = useMemo(() => {
    // We no longer need to reverse(), as App.tsx sends the newest first
    return results.filter(result =>
      result.email.toLowerCase().includes(filterText.toLowerCase()) ||
      result.details?.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [results, filterText]);

  const successCount = useMemo(() => results.filter(r => r.success).length, [results]);
  const errorCount = useMemo(() => results.filter(r => !r.success).length, [results]);

  const progressPercent = totalItems > 0 ? (results.length / totalItems) * 100 : 0;

  const getStatus = () => {
    if (isProcessing) {
      const remainingItems = totalItems - results.length;
      const timeRemaining = (remainingItems * countdown) + (countdown - countdown); 
      return (
        <div className="flex items-center text-blue-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing... ({results.length} / {totalItems}) - 
          Est. time: {timeRemaining.toFixed(0)}s - 
          Next in: {countdown.toFixed(0)}s
        </div>
      );
    }
    if (isComplete) {
      return (
        <div className="flex items-center text-green-600">
          <CheckCircle className="mr-2 h-4 w-4" />
          Processing Complete
        </div>
      );
    }
    return (
      <div className="flex items-center text-gray-500">
        <Clock className="mr-2 h-4 w-4" />
        Idle
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Results</CardTitle>
            <CardDescription className="min-h-[20px]">
              {getStatus()} - 
              <span className="text-green-600 ml-2">Success: {successCount}</span>
              <span className="text-red-600 ml-2">Errors: {errorCount}</span>
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <Input
              placeholder="Filter results by email..."
              value={filterText}
              onChange={(e) => onFilterTextChange(e.target.value)}
              className="w-64"
            />
            <ExportButton 
              results={results} 
              jobType="webinar"
              formData={{ emails: '', displayName: 'webinar_registration' }}
            />
          </div>
        </div>
        {isProcessing && (
            <Progress value={progressPercent} className="w-full mt-4" />
        )}
      </CardHeader>
      <CardContent>
        <div className="max-h-[500px] overflow-y-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-secondary">
              <TableRow>
                {/* --- ADDED: Number column --- */}
                <TableHead className="w-[60px]">#</TableHead>
                {/* --- END ADDED --- */}
                <TableHead className="w-[50px]">Status</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.length === 0 && (
                <TableRow>
                  {/* --- MODIFIED: Colspan updated --- */}
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {/* --- END MODIFIED --- */}
                    {isProcessing ? 'Waiting for first result...' : 'No results to display'}
                  </TableCell>
                </TableRow>
              )}
              {filteredResults.map((result, index) => (
                <TableRow key={index}>
                  {/* --- ADDED: Number cell --- */}
                  <TableCell className="font-mono text-xs text-muted-foreground">{result.number}</TableCell>
                  {/* --- END ADDED --- */}
                  <TableCell>
                    {result.success ? (
                      <Badge variant="success" className="h-6 w-6 p-0">
                        <CheckCircle className="h-4 w-4" />
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="h-6 w-6 p-0">
                        <XCircle className="h-4 w-4" />
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{result.email}</TableCell>
                  <TableCell>{result.details}</TableCell>
                  <TableCell className="text-red-600 text-xs">{result.error}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};