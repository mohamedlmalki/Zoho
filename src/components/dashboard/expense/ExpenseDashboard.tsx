import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile, ExpenseJobs, ExpenseJobState, ExpenseFormData } from '@/App';
import { ExpenseForm } from './ExpenseForm';
import { ExpenseResultsDisplay } from './ExpenseResultsDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface ExpenseDashboardProps {
  jobs: ExpenseJobs;
  setJobs: React.Dispatch<React.SetStateAction<ExpenseJobs>>;
  socket: Socket | null;
  createInitialJobState: () => ExpenseJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

export const ExpenseDashboard: React.FC<ExpenseDashboardProps> = ({
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

  const expenseProfiles = profiles.filter(p => p.expense?.orgId);

  useEffect(() => {
    if (expenseProfiles.length > 0) {
      setJobs(prevJobs => {
        const newJobs = { ...prevJobs };
        let updated = false;
        expenseProfiles.forEach(p => {
          if (!newJobs[p.profileName]) {
            newJobs[p.profileName] = createInitialJobState();
            updated = true;
          }
        });
        return updated ? newJobs : prevJobs;
      });
    }
    if (expenseProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(expenseProfiles[0]?.profileName || null);
    }
  }, [expenseProfiles, activeProfileName, setJobs, createInitialJobState]);

  useEffect(() => {
    if (!socket) return;
    const handleApiStatus = (result: any) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    });
    socket.on('apiStatusResult', handleApiStatus);
    return () => { socket.off('apiStatusResult', handleApiStatus); };
  }, [socket]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { 
        selectedProfileName: activeProfileName, 
        service: 'expense' 
      });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    const profile = expenseProfiles.find(p => p.profileName === profileName);
    if (profile) {
      setActiveProfileName(profileName);
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
    }
  };

  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'expense' });
    toast({ title: "Re-checking Connection..." });
  };

  const handleFormDataChange = (newFormData: ExpenseFormData) => {
    if (activeProfileName) {
      setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], formData: newFormData } }));
    }
  };

  const handleFormSubmit = () => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) {
      toast({ title: "Error", description: "Not connected to the server.", variant: "destructive" });
      return;
    }
    const currentJob = jobs[activeProfileName];
    const { formData } = currentJob;

    if (!formData.moduleName || !formData.bulkField || !formData.bulkValues) {
        toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
        return;
    }

    const items = formData.bulkValues.split('\n').filter(x => x.trim());

    setJobs(prev => ({
      ...prev,
      [activeProfileName]: {
        ...prev[activeProfileName],
        results: [],
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        totalToProcess: items.length,
        currentDelay: formData.delay,
        filterText: '',
      }
    }));

    socket.emit('startBulkExpense', {
      selectedProfileName: activeProfileName,
      ...formData
    });
  };

  const handlePauseResume = () => {
    if (!socket || !activeProfileName) return;
    const isPaused = jobs[activeProfileName]?.isPaused;
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'expense' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused } }));
  };

  const handleEndJob = () => {
    if (!socket || !activeProfileName) return;
    socket.emit('endJob', { profileName: activeProfileName, jobType: 'expense' });
  };

  const selectedProfile = expenseProfiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  return (
    <>
      <DashboardLayout
        onAddProfile={onAddProfile}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
        profiles={expenseProfiles} 
        selectedProfile={selectedProfile} 
        onProfileChange={handleProfileChange}
        jobs={jobs}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        stats={{
            totalTickets: currentJob?.results.length || 0,
            totalToProcess: currentJob?.totalToProcess || 0,
            isProcessing: currentJob?.isProcessing || false,
        }}
        service="expense"
      >
        <div className="space-y-8">
            {currentJob && selectedProfile && (
                <>
                    <ExpenseForm
                        socket={socket}
                        selectedProfileName={activeProfileName || ''}
                        jobState={currentJob}
                        formData={currentJob.formData}
                        onFormDataChange={handleFormDataChange}
                        onSubmit={handleFormSubmit}
                        isProcessing={currentJob.isProcessing}
                        isPaused={currentJob.isPaused}
                        onPauseResume={handlePauseResume}
                        onEndJob={handleEndJob}
                        // --- PASSING THE CONFIGURED MODULE ---
                        configuredModule={selectedProfile.expense?.customModuleApiName}
                    />

                    <ExpenseResultsDisplay
                        results={currentJob.results}
                        isProcessing={currentJob.isProcessing}
                        totalRows={currentJob.totalToProcess}
                        filterText={currentJob.filterText}
                        onFilterTextChange={(text) => handleFormDataChange({...currentJob.formData})} 
                        bulkFieldName={currentJob.formData.bulkField}
                    />
                </>
            )}
        </div>
      </DashboardLayout>

      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Connection Status</DialogTitle>
            <DialogDescription>Live status of the connection to Zoho Expense.</DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}>
            <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
          </div>
          {apiStatus.fullResponse && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response:</h4>
              <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                {JSON.stringify(apiStatus.fullResponse, null, 2)}
              </pre>
            </div>
          )}
          <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};