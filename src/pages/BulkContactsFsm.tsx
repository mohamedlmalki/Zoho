// --- FILE: src/pages/BulkContactsFsm.tsx ---

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Socket } from 'socket.io-client';
import { FsmContactJobs, FsmContactJobState, Profile } from '@/App';
import { ContactForm, ContactFormData } from '@/components/dashboard/fsm/ContactForm';
import { ContactResultsDisplay } from '@/components/dashboard/fsm/ContactResultsDisplay';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from "@tanstack/react-query";
// --- 1. IMPORT DIALOG COMPONENTS ---
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface BulkContactsFsmProps {
    jobs: FsmContactJobs;
    setJobs: React.Dispatch<React.SetStateAction<FsmContactJobs>>;
    socket: Socket | null;
    createInitialJobState: () => FsmContactJobState;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

const BulkContactsFsm: React.FC<BulkContactsFsmProps> = ({
    jobs,
    setJobs,
    socket,
    createInitialJobState,
    onAddProfile,
    onEditProfile,
    onDeleteProfile
}) => {
    const { toast } = useToast();
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [apiStatus, setApiStatus] = useState<any>(null);
    
    // --- 2. ADD STATE FOR STATUS DIALOG ---
    const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

    // Fetch profiles
    const { data: profiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        },
    });

    useEffect(() => {
        if (profiles.length > 0 && !selectedProfileName) {
            const fsmProfile = profiles.find(p => p.fsm && p.fsm.orgId);
            const firstProfile = fsmProfile || profiles[0];
            if (firstProfile) {
                setSelectedProfileName(firstProfile.profileName);
            }
        }
    }, [profiles, selectedProfileName]);

    const activeProfile = profiles.find(p => p.profileName === selectedProfileName) || null;
    const currentJob = selectedProfileName ? (jobs[selectedProfileName] || createInitialJobState()) : createInitialJobState();

    useEffect(() => {
        if (!socket) return;
        const handleStatus = (data: any) => {
            setApiStatus({
                status: data.success ? 'success' : 'error',
                message: data.message,
                fullResponse: data.fullResponse
            });
        };
        socket.on('apiStatusResult', handleStatus);
        return () => { socket.off('apiStatusResult', handleStatus); };
    }, [socket]);

    const handleProfileChange = (profileName: string) => {
        setSelectedProfileName(profileName);
        setApiStatus(null); 
    };

    const handleManualVerify = () => {
        if (!socket || !selectedProfileName) return;
        setApiStatus({ status: 'loading', message: 'Checking connection...' });
        socket.emit('checkApiStatus', {
            selectedProfileName: selectedProfileName,
            service: 'fsm'
        });
    };

    const handleStartJob = (data: ContactFormData) => {
        if (!socket || !selectedProfileName) {
            toast({ title: "Error", description: "Please select a profile first.", variant: "destructive" });
            return;
        }

        const emailList = data.emails.split('\n').map(e => e.trim()).filter(e => e);
        if (emailList.length === 0) {
            toast({ title: "Validation Error", description: "No valid emails found.", variant: "destructive" });
            return;
        }

        setJobs(prev => ({
            ...prev,
            [selectedProfileName]: {
                ...createInitialJobState(),
                formData: data,
                isProcessing: true,
                totalToProcess: emailList.length,
                processingStartTime: new Date(),
            }
        }));

        socket.emit('startBulkFsmContact', {
            emails: emailList,
            lastName: data.lastName,
            delay: data.delay,
            stopAfterFailures: data.stopAfterFailures,
            selectedProfileName
        });
        
        toast({ title: "Job Started", description: `Creating ${emailList.length} contacts...` });
    };

    const handlePauseResume = () => {
        if (!socket || !selectedProfileName) return;
        if (currentJob.isPaused) {
            socket.emit('resumeJob', { profileName: selectedProfileName, jobType: 'fsm-contact' });
            setJobs(prev => ({ ...prev, [selectedProfileName]: { ...prev[selectedProfileName], isPaused: false } }));
        } else {
            socket.emit('pauseJob', { profileName: selectedProfileName, jobType: 'fsm-contact' });
            setJobs(prev => ({ ...prev, [selectedProfileName]: { ...prev[selectedProfileName], isPaused: true } }));
        }
    };

    const handleStopJob = () => {
        if (socket && selectedProfileName) {
            socket.emit('endJob', { profileName: selectedProfileName, jobType: 'fsm-contact' });
        }
    };

    const handleFormDataChange = (newData: ContactFormData) => {
        setJobs(prev => {
            const job = prev[selectedProfileName] || createInitialJobState();
            return {
                ...prev,
                [selectedProfileName]: { ...job, formData: newData }
            };
        });
    };
    
    const formPayload: ContactFormData = {
        emails: currentJob.formData.emails || '',
        lastName: currentJob.formData.lastName || '',
        delay: currentJob.formData.delay ?? 1,
        stopAfterFailures: currentJob.formData.stopAfterFailures ?? 0 
    };

    const handleFetchFailures = () => {
         const failed = currentJob.results.filter(r => !r.success).map(r => r.email).join('\n');
         if (failed) {
             handleFormDataChange({ ...formPayload, emails: failed });
             toast({ title: "Loaded Failures", description: "Failed emails have been loaded back into the input." });
         } else {
             toast({ title: "No Failures", description: "There are no failed items to retry." });
         }
    };

    return (
        <DashboardLayout
            service="fsm" 
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
            profiles={profiles} 
            selectedProfile={activeProfile} 
            onProfileChange={handleProfileChange}
            apiStatus={apiStatus || { status: 'loading', message: '' }}
            // --- 3. UPDATED HANDLERS ---
            onShowStatus={() => setIsStatusDialogOpen(true)} // Opens the modal
            onManualVerify={handleManualVerify} // Refreshes the check
            // ---------------------------
            socket={socket}
            jobs={jobs}
            stats={{
                totalTickets: currentJob.results.length,
                totalToProcess: currentJob.totalToProcess,
                isProcessing: currentJob.isProcessing
            }}
        >
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Bulk FSM Contacts</h2>
                    <p className="text-muted-foreground">Create multiple contacts in Zoho FSM at once.</p>
                </div>

                <div className="flex flex-col gap-6">
                    <ContactForm 
                        onSubmit={handleStartJob}
                        isProcessing={currentJob.isProcessing}
                        isPaused={currentJob.isPaused}
                        onPauseResume={handlePauseResume}
                        onEndJob={handleStopJob}
                        formData={formPayload}
                        onFormDataChange={handleFormDataChange}
                        onFetchFailures={handleFetchFailures}
                        onClearLogs={() => {
                            setJobs(prev => ({
                                ...prev,
                                [selectedProfileName]: { ...prev[selectedProfileName], results: [] }
                            }));
                        }}
                        jobState={currentJob}
                        onRetryFailed={handleFetchFailures}
                        failedCount={currentJob.results.filter(r => !r.success).length}
                        countdown={currentJob.countdown}
                    />

                    <div className="min-h-[400px]">
                        <ContactResultsDisplay results={currentJob.results} />
                    </div>
                </div>

                {/* --- 4. RENDER THE STATUS DIALOG --- */}
                <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Connection Status</DialogTitle>
                            <DialogDescription>
                                API Status for profile: <strong>{selectedProfileName}</strong>
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-semibold mb-2">Message</h4>
                                <p className="text-sm text-muted-foreground">{apiStatus?.message || "No message available."}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Original Response</h4>
                                <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-auto text-xs font-mono border border-slate-800">
                                    <pre>{JSON.stringify(apiStatus?.fullResponse || {}, null, 2)}</pre>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
                {/* ----------------------------------- */}
            </div>
        </DashboardLayout>
    );
};

export default BulkContactsFsm;