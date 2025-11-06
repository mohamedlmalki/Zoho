import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, FileText, Clock, Pause, Play, Square, CheckCircle2, XCircle, Users } from 'lucide-react';
import { FsmInvoiceFormData, FsmInvoiceJobState } from '@/App';
import { formatTime } from '@/lib/utils';

interface InvoiceFormFsmProps {
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: FsmInvoiceFormData;
  onFormDataChange: (data: FsmInvoiceFormData) => void;
  jobState: FsmInvoiceJobState | null;
}

export const InvoiceFormFsm: React.FC<InvoiceFormFsmProps> = ({
  onSubmit,
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  formData,
  onFormDataChange,
  jobState
}) => {
  const invoiceDataCount = formData.invoiceData.split('\n').filter(line => line.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleInputChange = (field: keyof FsmInvoiceFormData, value: string | number) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const successCount = jobState?.results.filter(r => r.success && r.step === 'send').length || 0;
  const errorCount = jobState?.results.filter(r => !r.success).length || 0;

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Bulk Invoice Creation & Sending</CardTitle>
        </div>
        <CardDescription>
          Create and send multiple invoices from Zoho FSM work orders.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="invoiceData" className="flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>Invoice Data</span>
                </Label>
                <Badge variant="secondary" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {invoiceDataCount} invoices
                </Badge>
              </div>
              <Textarea
                id="invoiceData"
                placeholder="work_order_id_1,email1@example.com&#x0A;work_order_id_2,email2@example.com"
                value={formData.invoiceData}
                onChange={(e) => handleInputChange('invoiceData', e.target.value)}
                className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                required
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                Enter one Work Order ID and one email per line, separated by a comma.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delay" className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span>Delay Between Invoices</span>
            </Label>
            <div className="flex items-center space-x-3">
              <Input
                id="delay"
                type="number"
                min="0"
                step="1"
                value={formData.delay}
                onChange={(e) => handleInputChange('delay', parseInt(e.target.value) || 0)}
                className="w-24 h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                required
                disabled={isProcessing}
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
          </div>

          {jobState && (jobState.isProcessing || jobState.results.length > 0) && (
              <div className="pt-4 border-t border-dashed">
                  <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                          <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                          <p className="text-lg font-bold font-mono">{formatTime(jobState.processingTime)}</p>
                      </div>
                      <div>
                          <Label className="text-xs text-muted-foreground">Success</Label>
                          <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{successCount}</span>
                          </p>
                      </div>
                      <div>
                          <Label className="text-xs text-muted-foreground">Failed</Label>
                          <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                              <XCircle className="h-4 w-4" />
                              <span>{errorCount}</span>
                          </p>
                      </div>
                  </div>
              </div>
          )}

          <div className="pt-4 border-t border-border">
              {!isProcessing ? (
                <Button
                    type="submit"
                    variant="premium"
                    size="lg"
                    disabled={!formData.invoiceData.trim()}
                    className="w-full"
                >
                    <Send className="h-4 w-4 mr-2" />
                    Create & Send {invoiceDataCount} Invoices
                </Button>
              ) : (
                <div className="flex items-center justify-center space-x-4">
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={onPauseResume}
                        className="flex-1"
                    >
                        {isPaused ? (
                            <><Play className="h-4 w-4 mr-2" />Resume Job</>
                        ) : (
                            <><Pause className="h-4 w-4 mr-2" />Pause Job</>
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        onClick={onEndJob}
                        className="flex-1"
                    >
                        <Square className="h-4 w-4 mr-2" />
                        End Job
                    </Button>
                </div>
              )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};