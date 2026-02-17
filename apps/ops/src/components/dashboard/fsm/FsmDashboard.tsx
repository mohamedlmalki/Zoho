import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile, FsmContactJobs, FsmContactJobState, FsmContactFormData } from '@/App';
import { ContactForm } from './ContactForm';
import { ContactResultsDisplay } from './ContactResultsDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface FsmDashboardProps {
  jobs: FsmContactJobs;
  setJobs: React.Dispatch<React.SetStateAction<FsmContactJobs>>;
  socket: Socket | null;
  createInitialJobState: () => FsmContactJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

export const FsmDashboard: React.FC<FsmDashboardProps> = ({
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

  const fsmProfiles = profiles.filter(p => p.fsm);

  useEffect(() => {
    if (fsmProfiles.length > 0) {
        setJobs(prevJobs => {
            const newJobs = { ...prevJobs };
            let updated = false;
            fsmProfiles.forEach(p => {
                if (!newJobs[p.profileName]) {
                    newJobs[p.profileName] = createInitialJobState();
                    updated = true;
                }
            });
            return updated ? newJobs : prevJobs;
        });
    }
    if (fsmProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(fsmProfiles[0]?.profileName || null);
    }
  }, [fsmProfiles, activeProfileName, setJobs, createInitialJobState]);

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
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'fsm' });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
  };

  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'fsm' });
    toast({ title: "Re-checking Connection..." });
  };

  const handleFormDataChange = (newFormData: FsmContactFormData) => {
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

    const currentFormData = jobs[activeProfileName].formData;
    const emails = currentFormData.emails.split('\n').map((e: string) => e.trim()).filter(Boolean);
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
            currentDelay: currentFormData.delay,
            filterText: '',
        }
    }));
    socket.emit('startBulkCreateContact', {
        ...currentFormData,
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
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'fsm-contact' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };

  const handleEndJob = () => {
    if (!socket || !activeProfileName) return;
    socket.emit('endJob', { profileName: activeProfileName, jobType: 'fsm-contact' });
  };

  const selectedProfile = fsmProfiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  return (
    <>
      <DashboardLayout
        onAddProfile={onAddProfile}
        profiles={fsmProfiles}
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
                  <ContactForm
                      jobState={currentJob}
                      formData={currentJob.formData}
                      onFormDataChange={handleFormDataChange}
                      onSubmit={handleFormSubmit}
                      isProcessing={currentJob.isProcessing}
                      isPaused={currentJob.isPaused}
                      onPauseResume={handlePauseResume}
                      onEndJob={handleEndJob}
                  />
                  <ContactResultsDisplay
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
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>This is the live status of the connection to the Zoho FSM API for the selected profile.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4><pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogContent></Dialog>
    </>
  );
};