// --- FILE: src/components/dashboard/fsm/ContactForm.tsx ---

import React, { useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
    Send, Mail, Clock, Users, Pause, Play, Square, 
    Upload, User, Sparkles, AlertTriangle, RotateCcw, 
    CheckCircle2, XCircle, Timer, PauseCircle // <--- Added PauseCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/utils';
import { FsmContactJobState } from '@/App';

export interface ContactFormData {
  emails: string;
  lastName: string;
  delay: number;
  stopAfterFailures: number;
}

interface ContactFormProps {
  onSubmit: (data: ContactFormData) => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: ContactFormData;
  onFormDataChange: (data: ContactFormData) => void;
  onFetchFailures: () => void;
  onClearLogs: () => void;
  jobState: FsmContactJobState | null;
  onRetryFailed: () => void;
  failedCount: number;
  countdown?: number;
}

export const ContactForm: React.FC<ContactFormProps> = ({
  onSubmit, isProcessing, isPaused, onPauseResume, onEndJob,
  formData, onFormDataChange, jobState, onRetryFailed, failedCount, countdown = 0
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const emailCount = useMemo(() => formData.emails.split('\n').filter(email => email.trim() !== '').length, [formData.emails]);
  const successCount = jobState?.results.filter(r => r.success).length || 0;
  const errorCount = jobState?.results.filter(r => !r.success).length || 0;
  const totalProcessed = successCount + errorCount;
  const totalToProcess = jobState?.totalToProcess || 0;
  
  const progressPercent = totalToProcess > 0 ? (totalProcessed / totalToProcess) * 100 : 0;
  const showCountdown = countdown > 0 && !isPaused;

  const handleSubmit = (e: React.FormEvent) => { 
      e.preventDefault(); 
      onSubmit(formData); 
  };

  const handleInputChange = (field: keyof ContactFormData, value: string | number) => { 
      onFormDataChange({ ...formData, [field]: value }); 
  };

  const handleCleanEmails = () => {
      if (!formData.emails) return;
      const raw = formData.emails;
      const split = raw.split(/[\n,;]+/);
      const validEmails = new Set<string>();
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
      
      split.forEach(entry => {
          const match = entry.match(emailRegex);
          if (match && match[0]) {
              validEmails.add(match[0].toLowerCase().trim());
          }
      });

      const cleanedList = Array.from(validEmails).join('\n');
      onFormDataChange({ ...formData, emails: cleanedList });
      
      const count = validEmails.size;
      const originalCount = split.filter(s => s.trim()).length;
      toast({ title: "List Cleaned", description: `Removed duplicates & formatting. ${count} valid emails remain (was ${originalCount}).` });
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const emails = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi) || [];
        onFormDataChange({ ...formData, emails: emails.join('\n') });
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Send className="h-5 w-5 text-primary" />
              <span>Create Bulk Contacts</span>
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            
            {/* EMAIL SECTION */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emails" className="flex items-center space-x-2">
                    <Mail className="h-4 w-4" />
                    <span>Recipient Emails</span>
                  </Label>
                  <div className='flex items-center space-x-2'>
                    <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        onClick={handleCleanEmails}
                        disabled={isProcessing || !formData.emails}
                    >
                        <Sparkles className="h-3 w-3 mr-1" />
                        Clean List
                    </Button>
                    
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt" onChange={handleFileImport} />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                      <Upload className="h-3 w-3 mr-2" />
                      Import
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {emailCount}
                    </Badge>
                  </div>
                </div>
                <Textarea
                  id="emails"
                  placeholder="user1@example.com&#10;user2@example.com"
                  value={formData.emails}
                  onChange={(e) => handleInputChange('emails', e.target.value)}
                  className="min-h-[150px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
            </div>

            {/* --- PROGRESS BAR & LIVE STATS --- */}
            {jobState && (jobState.isProcessing || jobState.results.length > 0) && (
                <div className="space-y-4 py-4 border-y border-dashed bg-muted/10 px-4 rounded-md">
                    {/* Progress Bar */}
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-muted-foreground">
                            <span className="flex items-center gap-2">
                                Progress
                                {isPaused && <Badge variant="outline" className="text-[10px] h-4 px-1 border-yellow-500 text-yellow-600">PAUSED</Badge>}
                            </span>
                            <span>{Math.round(progressPercent)}%</span>
                        </div>
                        <Progress value={progressPercent} className={`h-2 w-full ${isPaused ? "opacity-50" : ""}`} />
                    </div>

                    {/* Stats Grid */}
                    <div className={`grid gap-4 text-center transition-all duration-300 ${showCountdown ? 'grid-cols-5' : 'grid-cols-4'}`}>
                        <div>
                            <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                            <p className={`text-lg font-bold font-mono ${isPaused ? "text-yellow-600" : ""}`}>
                                {formatTime(jobState.processingTime)}
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Success</Label>
                            <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                                <CheckCircle2 className="h-4 w-4" /><span>{successCount}</span>
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Failed</Label>
                            <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                                <XCircle className="h-4 w-4" /><span>{errorCount}</span>
                            </p>
                        </div>
                        
                        {/* Remaining */}
                        <div>
                            <Label className="text-xs text-muted-foreground">Remaining</Label>
                            <p className="text-lg font-bold font-mono text-muted-foreground flex items-center justify-center space-x-1">
                                <Clock className="h-4 w-4" /><span>{totalToProcess - totalProcessed}</span>
                            </p>
                        </div>

                        {/* Next Request - Conditional */}
                        {showCountdown && (
                            <div className="animate-pulse bg-primary/5 rounded-md">
                                <Label className="text-xs text-primary font-bold">Next Request</Label>
                                <p className="text-lg font-bold font-mono text-primary flex items-center justify-center space-x-1">
                                    <Timer className="h-4 w-4" /><span>{countdown}s</span>
                                </p>
                            </div>
                        )}
                        {/* Show PAUSED badge if manually paused */}
                        {isPaused && (
                             <div className="bg-yellow-50 rounded-md border border-yellow-100 flex flex-col justify-center items-center">
                                <Label className="text-[10px] text-yellow-600 font-bold uppercase tracking-wider">Status</Label>
                                <p className="text-sm font-bold font-mono text-yellow-600 flex items-center justify-center space-x-1">
                                    <PauseCircle className="h-4 w-4" /><span>PAUSED</span>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* ------------------------------------------- */}

            {/* CONFIGURATION SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="lastName" className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span>Subject</span>
                    </Label>
                    <Input 
                        id="lastName" 
                        value={formData.lastName} 
                        onChange={(e) => handleInputChange('lastName', e.target.value)} 
                        className="bg-muted/30 border-border focus:bg-card"
                        placeholder="e.g. FsmContact"
                        required 
                        disabled={isProcessing} 
                    />
                    <p className="text-[10px] text-muted-foreground">FSM requires a Last Name for contacts.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="delay" className="flex items-center space-x-2">
                            <Clock className="h-4 w-4" /><span>Delay (s)</span>
                        </Label>
                        <Input 
                            id="delay" 
                            type="number" 
                            min="0" 
                            value={formData.delay} 
                            // --- FIX: Correct handling of 0 ---
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleInputChange('delay', isNaN(val) ? 0 : val);
                            }} 
                            // ----------------------------------
                            className="bg-muted/30 border-border focus:bg-card" 
                            required 
                            disabled={isProcessing} 
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="stopAfterFailures" className="flex items-center space-x-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" /><span>Stop on Fail</span>
                        </Label>
                        <Input 
                            id="stopAfterFailures" 
                            type="number" 
                            min="0" 
                            placeholder="0 (Off)" 
                            value={formData.stopAfterFailures === 0 ? '' : formData.stopAfterFailures} 
                            onChange={(e) => handleInputChange('stopAfterFailures', parseInt(e.target.value) || 0)} 
                            className="bg-muted/30 border-border focus:bg-card" 
                            disabled={isProcessing} 
                        />
                     </div>
                </div>
            </div>

          </div>

          <div className="pt-4 border-t border-border">
            {!isProcessing ? (
              <div className="flex gap-3">
                <Button type="submit" variant="premium" size="lg" disabled={!formData.emails.trim() || !formData.lastName.trim()} className="flex-1">
                    <Send className="h-4 w-4 mr-2" />
                    Create {emailCount} Contacts
                </Button>
                {failedCount > 0 && (
                     <Button type="button" variant="secondary" size="lg" className="border-red-200 hover:bg-red-50 text-red-700" onClick={(e) => { e.preventDefault(); onRetryFailed(); }}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Retry Failed ({failedCount})
                     </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-4">
                <Button type="button" variant="secondary" size="lg" onClick={onPauseResume} className="flex-1">
                  {isPaused ? <><Play className="h-4 w-4 mr-2" />Resume Job</> : <><Pause className="h-4 w-4 mr-2" />Pause Job</>}
                </Button>
                <Button type="button" variant="destructive" size="lg" onClick={onEndJob} className="flex-1">
                  <Square className="h-4 w-4 mr-2" />End Job
                </Button>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};