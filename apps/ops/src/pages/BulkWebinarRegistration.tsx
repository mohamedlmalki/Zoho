// --- FILE: src/pages/BulkWebinarRegistration.tsx ---
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { Profile, WebinarJobs, WebinarJobState } from '@/App';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, Pause, Square } from 'lucide-react';
import { WebinarResultsDisplay } from '@/components/dashboard/meeting/WebinarResultsDisplay';

// This component will be the form
interface WebinarFormProps {
  jobState: WebinarJobState;
  onFormDataChange: (newFormData: WebinarJobState['formData']) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  socket: Socket | null;
  selectedProfile: Profile | null;
  orgName: string | null;
}

const WebinarForm: React.FC<WebinarFormProps> = ({
  jobState,
  onFormDataChange,
  onSubmit,
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  socket,
  selectedProfile,
  orgName,
}) => {
  const [webinarList, setWebinarList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const formData = jobState.formData;

  useEffect(() => {
    if (!socket || !selectedProfile) {
        setWebinarList([]);
        return;
    }

    setIsLoading(true);
    socket.emit('fetchWebinars', { selectedProfileName: selectedProfile.profileName });

    const onWebinarsList = (result: { success: boolean; data: any[] }) => {
      setIsLoading(false);
      if (result.success) {
        setWebinarList(result.data);

        if (result.data.length > 0 && !formData.webinarId) {
            const firstWebinar = result.data[0];
            onFormDataChange({
              ...formData,
              webinarId: firstWebinar.id,
              webinar: firstWebinar,
            });
        }

      } else {
        toast({ title: "Error", description: "Could not fetch webinars.", variant: "destructive" });
      }
    };

    const onError = (error: { message: string }) => {
      setIsLoading(false);
      toast({ title: "Webinar Error", description: error.message, variant: "destructive" });
    };

    socket.on('webinarsList', onWebinarsList);
    socket.on('webinarError', onError);

    return () => {
      socket.off('webinarsList', onWebinarsList);
      socket.off('webinarError', onError);
    };
  }, [socket, selectedProfile, toast, formData, onFormDataChange]);

  const handleSelectChange = (webinarId: string) => {
    const selectedWebinar = webinarList.find(w => w.id === webinarId) || null;
    onFormDataChange({
      ...formData,
      webinarId: webinarId,
      webinar: selectedWebinar,
    });
  };

  const handleEmailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onFormDataChange({ ...formData, emails: e.target.value });
  };
  
  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFormDataChange({ ...formData, firstName: e.target.value });
  };
  
  const handleDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFormDataChange({ ...formData, delay: Number(e.target.value) || 1 });
  };
  
  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Bulk Webinar Registration</CardTitle>
          <CardDescription>
            Select a webinar, set a delay, and paste a list of emails to register.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webinar-select">Select Webinar</Label>
            <Select
              value={formData.webinarId}
              onValueChange={handleSelectChange}
              disabled={isLoading || isProcessing || webinarList.length === 0}
            >
              <SelectTrigger id="webinar-select">
                <SelectValue placeholder={
                  isLoading ? "Loading webinars..." : (webinarList.length === 0 ? "No webinars found" : "Select a webinar")
                } />
              </SelectTrigger>
              <SelectContent>
                {webinarList.map((webinar) => (
                  <SelectItem key={webinar.id} value={webinar.id}>
                    {webinar.title} ({new Date(webinar.start_time).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="emails">
                  Registrant Emails (one per line)
              </Label>
              <Textarea
                  id="emails"
                  placeholder="john.doe@email.com
jane.smith@email.com
..."
                  className="min-h-[200px] font-mono"
                  value={formData.emails}
                  onChange={handleEmailsChange}
                  disabled={isProcessing}
              />
            </div>

            <div className="space-y-6 md:col-span-1">
                <div className="space-y-2">
                    <Label htmlFor="firstName">
                        First Name (for all)
                    </Label>
                    <Input
                        id="firstName"
                        placeholder="e.g., Guest"
                        value={formData.firstName}
                        onChange={handleFirstNameChange}
                        disabled={isProcessing}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="delay">Delay (seconds)</Label>
                    <Input
                        id="delay"
                        type="number"
                        value={formData.delay}
                        onChange={handleDelayChange}
                        min="1"
                        className="w-full"
                        disabled={isProcessing}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                        id="orgName"
                        type="text"
                        value={orgName || (isLoading ? "Fetching..." : "N/A")}
                        disabled // Make it read-only
                        className="w-full"
                    />
                </div>
            </div>

          </div>
          
          <div className="flex space-x-2">
            {!isProcessing ? (
              <Button type="submit" disabled={isLoading || !formData.webinarId || !formData.emails || !formData.firstName}>
                Start Bulk Registration
              </Button>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={onPauseResume}>
                  {isPaused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button type="button" variant="destructive" onClick={onEndJob}>
                  <Square className="mr-2 h-4 w-4" />
                  End Job
                </Button>
              </>
            )}
          </div>

        </CardContent>
      </Card>
    </form>
  );
};


// This is the main page component
interface BulkWebinarRegistrationProps {
  jobs: WebinarJobs;
  setJobs: React.Dispatch<React.SetStateAction<WebinarJobs>>;
  socket: Socket | null;
  createInitialJobState: () => WebinarJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

const BulkWebinarRegistration: React.FC<BulkWebinarRegistrationProps> = ({
  jobs,
  setJobs,
  socket,
  createInitialJobState,
  onAddProfile,
  onEditProfile,
  onDeleteProfile,
}) => {
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting...' });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (profiles.length > 0) {
      // --- FIX: Filter by zsoid so we don't select an empty profile ---
      const meetingProfiles = profiles.filter(p => p.meeting && p.meeting.zsoid);
      
      const currentProfileIsValid = meetingProfiles.some(p => p.profileName === activeProfileName);

      if ((!activeProfileName || !currentProfileIsValid) && meetingProfiles.length > 0) {
        setActiveProfileName(meetingProfiles[0].profileName);
      } else if (meetingProfiles.length === 0) {
        setActiveProfileName(null);
      }
      
      setJobs(prevJobs => {
        const newJobs = { ...prevJobs };
        let updated = false;
        profiles.forEach(p => {
          if (!newJobs[p.profileName]) {
            newJobs[p.profileName] = createInitialJobState();
            updated = true;
          }
        });
        return updated ? newJobs : prevJobs;
      });
    }
  }, [profiles, activeProfileName, setJobs, createInitialJobState]);

  useEffect(() => {
    if (!socket || !activeProfileName) {
        setApiStatus({ status: 'loading', message: 'Please select a profile.' });
        return;
    }
    
    setApiStatus({ status: 'loading', message: 'Checking API connection...' });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'meeting' });

    const onApiStatus = (result: any) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    });
    
    socket.on('apiStatusResult', onApiStatus);
    return () => { socket.off('apiStatusResult', onApiStatus); };
  }, [socket, activeProfileName]);
  
  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
  };

  const handleManualVerify = () => {
    if (socket && activeProfileName) {
      setApiStatus({ status: 'loading', message: 'Re-checking API...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'meeting' });
    }
  };

  const selectedProfile = useMemo(() => 
    profiles.find(p => p.profileName === activeProfileName) || null
  , [profiles, activeProfileName]);
  
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  const orgName = useMemo(() => {
      if (apiStatus.status === 'success' && apiStatus.fullResponse?.userData?.organization?.org_name) {
          return apiStatus.fullResponse.userData.organization.org_name;
      }
      return null;
  }, [apiStatus]);

  const handleFormDataChange = (newFormData: WebinarJobState['formData']) => {
    if (activeProfileName && currentJob) {
      setJobs(prevJobs => ({
        ...prevJobs,
        [activeProfileName]: {
          ...currentJob,
          formData: newFormData,
          currentDelay: newFormData.delay
        }
      }));
    }
  };

  const handleFormSubmit = () => {
    if (!socket || !activeProfileName || !currentJob || !currentJob.formData.webinar || !currentJob.formData.emails || !currentJob.formData.firstName) return;
    
    const { emails, webinar } = currentJob.formData;
    const allEmails = emails.split('\n').filter(line => line.trim() !== '');
    
    if (allEmails.length === 0) {
      toast({ title: "No Emails", description: "Please paste registrant emails.", variant: "destructive" });
      return;
    }
    
    setJobs(prev => {
        const profileJob = prev[activeProfileName];
        return {
            ...prev,
            [activeProfileName]: {
                ...profileJob,
                results: [], 
                isProcessing: true,
                isPaused: false,
                isComplete: false,
                processingStartTime: new Date(),
                totalToProcess: allEmails.length,
                currentDelay: profileJob.formData.delay,
            }
        };
    });
    
    toast({ title: `Processing Started`, description: `Registering ${allEmails.length} users...` });

    socket.emit('startBulkRegistration', {
      ...currentJob.formData,
      selectedProfileName: activeProfileName,
      webinar: currentJob.formData.webinar,
      displayName: currentJob.formData.displayName || 'webinar_registration'
    });
  };

  const handlePauseResume = () => {
    if (!socket || !activeProfileName || !currentJob) return;
    const isPaused = currentJob.isPaused;
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'webinar' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };
  
  const handleEndJob = () => {
    if (!socket || !activeProfileName || !currentJob) return;
    if (window.confirm("Are you sure you want to end this job?")) {
        socket.emit('endJob', { profileName: activeProfileName, jobType: 'webinar' });
    }
  };
  
  const jobForStats = currentJob;
  const stats = {
    totalTickets: jobForStats?.results.length ?? 0,
    successCount: jobForStats?.results.filter(r => r.success).length ?? 0,
    errorCount: jobForStats?.results.filter(r => !r.success).length ?? 0,
    processingTime: jobForStats?.processingTime ?? 0,
    totalToProcess: jobForStats?.totalToProcess ?? 0,
    isProcessing: jobForStats?.isProcessing ?? false,
  };

  return (
    <>
      <DashboardLayout
        stats={stats}
        onAddProfile={onAddProfile}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
        profiles={profiles}
        selectedProfile={selectedProfile}
        jobs={jobs}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        service="meeting"
      >
        <div className="space-y-8">
          {currentJob && (
            <>
              <WebinarForm
                jobState={currentJob}
                onFormDataChange={handleFormDataChange}
                onSubmit={handleFormSubmit}
                isProcessing={currentJob.isProcessing}
                isPaused={currentJob.isPaused}
                onPauseResume={handlePauseResume}
                onEndJob={handleEndJob}
                socket={socket}
                selectedProfile={selectedProfile}
                orgName={orgName}
              />
              <WebinarResultsDisplay
                results={currentJob.results}
                isProcessing={currentJob.isProcessing}
                isComplete={currentJob.isComplete}
                totalItems={currentJob.totalToProcess}
                countdown={currentJob.countdown}
                filterText={currentJob.filterText}
                onFilterTextChange={(text) => setJobs(prev => ({...prev, [activeProfileName!]: { ...prev[activeProfileName!], filterText: text }}))}
              />
            </>
          )}
        </div>
      </DashboardLayout>

      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>API Connection Status</DialogTitle>
                <DialogDescription>
                    This is the live status of the connection to the Zoho Meeting API.
                </DialogDescription>
            </DialogHeader>
            <div className={`p-4 rounded-md ${
                apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' 
                : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' 
                : 'bg-muted'
            }`}>
                <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
                <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
            </div>
            {apiStatus.fullResponse && (
                <div className="mt-4">
                    <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
                    <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                        {typeof apiStatus.fullResponse === 'string' ? apiStatus.fullResponse : JSON.stringify(apiStatus.fullResponse, null, 2)}
                    </pre>
                </div>
            )}
            <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkWebinarRegistration;