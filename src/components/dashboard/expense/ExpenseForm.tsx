import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Layers, Database, List, Clock, Play, Pause, Square, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatTime } from '@/lib/utils';
import { ExpenseFormData, ExpenseJobState } from '@/App'; 
import { Socket } from 'socket.io-client';

interface ExpenseFormProps {
  socket: Socket | null;
  selectedProfileName: string;
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: ExpenseFormData;
  onFormDataChange: (data: ExpenseFormData) => void;
  jobState: ExpenseJobState | null;
  configuredModule?: string; 
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ 
  socket,
  selectedProfileName,
  onSubmit, 
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  formData,
  onFormDataChange,
  jobState,
  configuredModule
}) => {
  const [fields, setFields] = useState<any[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  const itemCount = formData.bulkValues
    .split('\n')
    .filter(line => line.trim() !== '').length;

  // --- SMART LOGIC: Auto-select and Lock Module ---
  useEffect(() => {
      if (configuredModule && formData.moduleName !== configuredModule) {
          onFormDataChange({ ...formData, moduleName: configuredModule });
      }
  }, [configuredModule, selectedProfileName]); 

  // --- Auto-Fetch Fields ---
  useEffect(() => {
    if (!socket || !formData.moduleName || !selectedProfileName) return;

    setIsLoadingFields(true);
    socket.emit('getExpenseFields', { 
        profileName: selectedProfileName, 
        module: formData.moduleName 
    });

    const handleFieldsLoaded = (data: { success: boolean, fields: any[] }) => {
        setIsLoadingFields(false);
        if (data.success) {
            setFields(data.fields);
        }
    };

    socket.on('expenseFieldsLoaded', handleFieldsLoaded);
    return () => {
        socket.off('expenseFieldsLoaded', handleFieldsLoaded);
    };
  }, [formData.moduleName, selectedProfileName, socket]);

  const handleInputChange = (field: keyof ExpenseFormData, value: any) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const handleDefaultDataChange = (apiName: string, value: string) => {
    onFormDataChange({
        ...formData,
        defaultData: {
            ...formData.defaultData,
            [apiName]: value
        }
    });
  };

  const successCount = jobState?.results.filter(r => r.success).length || 0;
  const errorCount = jobState?.results.filter(r => r.success === false).length || 0;

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Create Bulk Expenses</CardTitle>
        </div>
        <CardDescription>
          Bulk create records in <strong>{configuredModule || 'selected'}</strong> module.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-6">
            
          {/* Top Row: Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label>1. Active Module</Label>
                {configuredModule ? (
                    // --- SMART VIEW: LOCKED ---
                    <div className="flex items-center justify-between p-2.5 border rounded-md bg-green-50/50 border-green-200">
                        <div className="flex items-center space-x-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="font-mono text-sm font-semibold text-green-800">{configuredModule}</span>
                        </div>
                        {isLoadingFields && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                ) : (
                    // --- FALLBACK: SELECTOR ---
                    <div className="space-y-1">
                        <Select 
                            value={formData.moduleName} 
                            onValueChange={(val) => handleInputChange('moduleName', val)}
                            disabled={isProcessing}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select Module" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Expenses">Expenses</SelectItem>
                                <SelectItem value="Trips">Trips</SelectItem>
                                <SelectItem value="Reports">Reports</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-destructive">* Configure "Module API Name" in Profile to lock this.</p>
                    </div>
                )}
             </div>

             <div className="space-y-2">
                <Label>2. Select Bulk Iterator Field</Label>
                <Select 
                    value={formData.bulkField} 
                    onValueChange={(val) => handleInputChange('bulkField', val)}
                    disabled={isProcessing || fields.length === 0}
                >
                    <SelectTrigger>
                        <SelectValue placeholder={isLoadingFields ? "Loading fields..." : "Which field changes per record?"} />
                    </SelectTrigger>
                    <SelectContent>
                        {fields.map(f => (
                            <SelectItem key={f.api_name} value={f.api_name}>
                                {f.label} <span className="text-xs text-muted-foreground">({f.api_name})</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             </div>
          </div>

          {/* Middle: Split View for Data Entry */}
          {formData.bulkField && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 border-t pt-4">
                
                {/* Left: Bulk Data */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="flex items-center space-x-2">
                            <List className="h-4 w-4" />
                            <span>Bulk Values for <Badge variant="outline">{formData.bulkField}</Badge></span>
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                            {itemCount} records
                        </Badge>
                    </div>
                    <Textarea 
                        placeholder="Paste values here (one per line)..."
                        value={formData.bulkValues}
                        onChange={(e) => handleInputChange('bulkValues', e.target.value)}
                        className="min-h-[300px] font-mono text-sm"
                        disabled={isProcessing}
                    />
                     {jobState && (jobState.isProcessing || jobState.results.length > 0) && (
                        <div className="pt-4 border-t border-dashed">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Time</Label>
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
                </div>

                {/* Right: Default Data */}
                <div className="space-y-2">
                    <Label className="flex items-center space-x-2">
                        <Layers className="h-4 w-4" />
                        <span>Default Data (Applied to all)</span>
                    </Label>
                    <div className="h-[300px] overflow-y-auto border rounded-md p-4 space-y-4 bg-muted/10">
                        {fields.length > 0 ? (
                            fields.filter(f => f.api_name !== formData.bulkField && !f.read_only).map(field => (
                                <div key={field.api_name} className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                                    <Input 
                                        placeholder={field.data_type}
                                        value={formData.defaultData[field.api_name] || ''}
                                        onChange={(e) => handleDefaultDataChange(field.api_name, e.target.value)}
                                        disabled={isProcessing}
                                        className="h-8"
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin mb-2 opacity-20" />
                                <p className="text-sm">Loading fields...</p>
                            </div>
                        )}
                    </div>
                </div>
              </div>
          )}

          {/* Bottom: Delay & Actions */}
          <div className="space-y-4 pt-4 border-t">
               <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay (Seconds)</span>
                </Label>
                <Input
                    id="delay"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.delay}
                    onChange={(e) => handleInputChange('delay', parseFloat(e.target.value) || 0)}
                    className="w-24"
                    disabled={isProcessing}
                />
              </div>

              {!isProcessing ? (
                <Button
                    onClick={onSubmit}
                    variant="premium"
                    size="lg"
                    disabled={!formData.bulkValues.trim() || !formData.moduleName || !formData.bulkField}
                    className="w-full"
                >
                    <Send className="h-4 w-4 mr-2" />
                    Process {itemCount} Records
                </Button>
              ) : (
                <div className="flex items-center justify-center space-x-4">
                    <Button
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

        </div>
      </CardContent>
    </Card>
  );
};