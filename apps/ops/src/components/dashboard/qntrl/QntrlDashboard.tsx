import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile, QntrlJobs, QntrlJobState } from '@/App';
import { QntrlForm } from './QntrlForm';
import { QntrlResultsDisplay } from './QntrlResultsDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface QntrlDashboardProps {
  jobs: QntrlJobs;
  setJobs: React.Dispatch<React.SetStateAction<QntrlJobs>>;
  socket: Socket | null;
  createInitialJobState: () => QntrlJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
  service: string; 
}

const SERVER_URL = "http://localhost:3000";

export const QntrlDashboard: React.FC<QntrlDashboardProps> = ({
    jobs,
    setJobs,
    socket,
    createInitialJobState,
    onAddProfile,
    onEditProfile,
    onDeleteProfile,
    service
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

  const qntrlProfiles = profiles.filter(p => p.qntrl?.orgId);

  useEffect(() => {
    if (qntrlProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(qntrlProfiles[0]?.profileName || null);
    }
  }, [qntrlProfiles, activeProfileName]);

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
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'qntrl' });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
  };

  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'qntrl' });
    toast({ title: "Re-checking Connection..." });
  };

  const setJobStateForProfile = (
    profileName: string,
    state: Partial<QntrlJobState> | ((prevState: QntrlJobState) => QntrlJobState)
  ) => {
    setJobs(prevJobs => {
        const currentJobState = prevJobs[profileName] || createInitialJobState();
        const newState = typeof state === 'function' 
            ? state(currentJobState)
            : { ...currentJobState, ...state };
      
        return {
            ...prevJobs,
            [profileName]: newState,
        };
    });
  };

  const selectedProfile = qntrlProfiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = (activeProfileName ? jobs[activeProfileName] : null) || createInitialJobState();

  return (
    <>
      <DashboardLayout
        onAddProfile={onAddProfile}
        profiles={qntrlProfiles}
        selectedProfile={selectedProfile}
        jobs={jobs}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
        service={service as any} // <--- THIS LINE WAS ADDED
      >
        <div className="space-y-8">
          {activeProfileName && (
              <>
                  <QntrlForm
                      profileName={activeProfileName}
                      socket={socket}
                      job={currentJob}
                      setJobState={setJobStateForProfile}
                      createInitialJobState={createInitialJobState}
                  />
                  <QntrlResultsDisplay
                      job={currentJob}
                  />
              </>
          )}
        </div>
      </DashboardLayout>
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>This is the live status of the connection to the Zoho Qntrl API for the selected profile.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4><pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogContent></Dialog>
    </>
  );
};