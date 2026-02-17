import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile, EmailJobs, EmailJobState, EmailFormData } from '@/App';
import { EmailForm } from './EmailForm';
import { EmailResultsDisplay } from './EmailResultsDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface EmailDashboardProps {
  jobs: EmailJobs;
  setJobs: React.Dispatch<React.SetStateAction<EmailJobs>>;
  socket: Socket | null;
  createInitialJobState: () => EmailJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

export const EmailDashboard: React.FC<EmailDashboardProps> = ({ 
    jobs, 
    setJobs, 
    socket, 
    createInitialJobState,
    onAddProfile, 
    onEditProfile,
    onDeleteProfile
}) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const catalystProfiles = profiles.filter(p => p.catalyst?.projectId);

  useEffect(() => {
    if (catalystProfiles.length > 0) {
        setJobs(prevJobs => {
            const newJobs = { ...prevJobs };
            let updated = false;
            catalystProfiles.forEach(p => {
                if (!newJobs[p.profileName]) {
                    newJobs[p.profileName] = createInitialJobState();
                    updated = true;
                }
            });
            return updated ? newJobs : prevJobs;
        });
    }
    if (catalystProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(catalystProfiles[0]?.profileName || null);
    }
  }, [catalystProfiles, activeProfileName, setJobs, createInitialJobState]);
  
  useEffect(() => {
    if (!socket) return;
    const handleApiStatus = (result: any) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    });
    socket.on('apiStatusResult', handleApiStatus);
    return () => {
      socket.off('apiStatusResult', handleApiStatus);
    };
  }, [socket]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'catalyst' });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
  };
  
  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'catalyst' });
    toast({ title: "Re-checking Connection..." });
  };
  
  const handleFormDataChange = (newFormData: EmailFormData) => {
    if (activeProfileName) {
        setJobs(prev => ({
            ...prev,
            [activeProfileName]: {
                ...prev[activeProfileName],
                formData: newFormData
            }
        }));
    }
  };

  const handleFormSubmit = () => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) return;
    
    // --- FIX STARTS HERE ---
    const selectedProfile = catalystProfiles.find(p => p.profileName === activeProfileName);
    if (!selectedProfile?.catalyst?.fromEmail) {
        toast({ 
            title: "Configuration Error", 
            description: "A 'From Email' address must be set in the profile settings for this feature.", 
            variant: "destructive"
        });
        return;
    }
    // --- FIX ENDS HERE ---

    const currentJob = jobs[activeProfileName];
    const emails = currentJob.formData.emails.split('\n').map((e: string) => e.trim()).filter(Boolean);
    if (emails.length === 0) {
        toast({ title: "No emails provided", variant: "destructive" });
        return;
    }

    setJobs(prev => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            results: [], 
            isProcessing: true,
            isPaused: false,
            isComplete: false,
            processingStartTime: new Date(),
            processingTime: 0,
            totalToProcess: emails.length,
            currentDelay: currentJob.formData.delay,
            filterText: '',
        }
    }));

    socket.emit('startBulkEmail', {
        ...currentJob.formData,
        emails,
        selectedProfileName: activeProfileName
    });
  };

  const handleFilterTextChange = (text: string) => {
    if (activeProfileName) {
      setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], filterText: text } }));
    }
  };

  const handlePauseResume = () => {
    if (!socket || !activeProfileName) return;
    const isPaused = jobs[activeProfileName]?.isPaused;
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'email' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };

  const handleEndJob = () => {
    if (!socket || !activeProfileName) return;
    socket.emit('endJob', { profileName: activeProfileName, jobType: 'email' });
  };

  const selectedProfile = catalystProfiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  return (
    <>
      <DashboardLayout
        onAddProfile={onAddProfile}
        profiles={catalystProfiles}
        selectedProfile={selectedProfile}
        jobs={jobs}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
      >
        <div className="space-y-8">
          {currentJob && (
              <>
                  <EmailForm 
                      jobState={currentJob}
                      formData={currentJob.formData}
                      onFormDataChange={handleFormDataChange}
                      onSubmit={handleFormSubmit} 
                      isProcessing={currentJob.isProcessing}
                      isPaused={currentJob.isPaused}
                      onPauseResume={handlePauseResume}
                      onEndJob={handleEndJob}
                      fromEmail={selectedProfile?.catalyst?.fromEmail || ''}
                  />
                  <EmailResultsDisplay
                      results={currentJob.results} 
                      isProcessing={currentJob.isProcessing}
                      isComplete={currentJob.isComplete}
                      totalToProcess={currentJob.totalToProcess}
                      countdown={currentJob.countdown}
                      filterText={currentJob.filterText}
                      onFilterTextChange={handleFilterTextChange}
                  />
              </>
          )}
        </div>
      </DashboardLayout>
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>This is the live status of the connection to the Zoho Catalyst API for the selected profile.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4><pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogContent></Dialog>
    </>
  );
};