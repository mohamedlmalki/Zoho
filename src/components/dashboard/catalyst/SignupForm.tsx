import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Users, Clock, User as UserIcon, Pause, Play, Square, CheckCircle2, XCircle } from 'lucide-react';
import { CatalystSignupFormData, CatalystJobState } from '@/App';
import { formatTime } from '@/lib/utils';

interface SignupFormProps {
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: CatalystSignupFormData;
  onFormDataChange: (data: CatalystSignupFormData) => void;
  jobState: CatalystJobState | null;
}

export const SignupForm: React.FC<SignupFormProps> = ({
  onSubmit,
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  formData,
  onFormDataChange,
  jobState
}) => {
  const emailCount = formData.emails.split('\n').filter(email => email.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleInputChange = (field: keyof CatalystSignupFormData, value: string | number) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const successCount = jobState?.results.filter(r => r.success).length || 0;
  const errorCount = jobState?.results.filter(r => r.success === false).length || 0;

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <UserIcon className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Bulk User Signup</CardTitle>
        </div>
        <CardDescription>
          Add multiple users to your Catalyst project.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emails" className="flex items-center space-x-2">
                    <Users className="h-4 w-4" />
                    <span>Recipient Emails</span>
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {emailCount} users
                  </Badge>
                </div>
                <Textarea
                  id="emails"
                  placeholder="user1@example.com&#x0A;user2@example.com&#x0A;user3@example.com"
                  value={formData.emails}
                  onChange={(e) => handleInputChange('emails', e.target.value)}
                  className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Enter one email address per line.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name (for all users)</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  placeholder="Enter a first name"
                  disabled={isProcessing}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name (for all users)</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  placeholder="Enter a last name"
                  disabled={isProcessing}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay Between Signups</span>
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
                    disabled={!formData.emails.trim() || !formData.firstName.trim() || !formData.lastName.trim()}
                    className="w-full"
                >
                    <Send className="h-4 w-4 mr-2" />
                    Sign Up {emailCount} Users
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