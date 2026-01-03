// --- FILE: src/pages/ExpenseCustomModule.tsx ---

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { Profile, ExpenseJobs, ExpenseJobState } from '@/App';
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ExpenseResultsDisplay, ExpenseResult } from '@/components/dashboard/expense/ExpenseResultsDisplay';
import { ExpenseBulkForm, ExpenseField } from '@/components/dashboard/expense/ExpenseBulkForm';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SERVER_URL = "http://localhost:3000";

interface PageProps {
    socket: Socket | null;
    jobs: ExpenseJobs;
    setJobs: React.Dispatch<React.SetStateAction<ExpenseJobs>>;
    createInitialJobState: () => ExpenseJobState;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

type ApiStatus = { status: 'loading' | 'success' | 'error'; message: string; fullResponse?: any; };

const ExpenseCustomModule: React.FC<PageProps> = ({ socket, jobs, setJobs, createInitialJobState, onAddProfile, onEditProfile, onDeleteProfile }) => {
    const { toast } = useToast();
    
    const { data: profiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: () => fetch(`${SERVER_URL}/api/profiles`).then(res => res.json()),
    });

    const expenseProfiles = useMemo(() => profiles.filter(p => p.expense && p.expense.orgId), [profiles]);
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const selectedProfile = expenseProfiles.find(p => p.profileName === selectedProfileName) || null;

    // --- NEW: Local state for search filter ---
    const [filterText, setFilterText] = useState('');

    useEffect(() => {
        if (expenseProfiles.length > 0 && !selectedProfileName) setSelectedProfileName(expenseProfiles[0].profileName);
    }, [expenseProfiles, selectedProfileName]);

    // Reset filter when profile changes
    useEffect(() => {
        setFilterText('');
    }, [selectedProfileName]);

    const activeJob = useMemo(() => {
        if (selectedProfileName && jobs[selectedProfileName]) return jobs[selectedProfileName];
        return createInitialJobState();
    }, [jobs, selectedProfileName, createInitialJobState]);

    const { formData } = activeJob;
    const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Checking...' });
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isLoadingFields, setIsLoadingFields] = useState(false);

    const updateJobData = (field: string, value: any) => {
        if (!selectedProfileName) return;
        setJobs(prev => ({
            ...prev,
            [selectedProfileName]: {
                ...(prev[selectedProfileName] || createInitialJobState()),
                formData: { ...(prev[selectedProfileName]?.formData || createInitialJobState().formData), [field]: value }
            }
        }));
    };

    // Automatic Fetch Fields Logic
    const handleFetchFields = useCallback(() => {
        if (!socket || !selectedProfileName) return;
        setIsLoadingFields(true);
        socket.emit('getExpenseFields', { selectedProfileName, moduleName: formData.moduleName });
    }, [socket, selectedProfileName, formData.moduleName]);

    useEffect(() => {
        if (selectedProfileName && socket) {
            handleFetchFields();
        }
    }, [selectedProfileName, socket, handleFetchFields]);

    useEffect(() => {
        if (!socket) return;
        socket.on('apiStatusResult', (result) => setApiStatus({ status: result.success ? 'success' : 'error', message: result.message, fullResponse: result.fullResponse }));
        socket.on('expenseFieldsFetched', (fetchedFields: ExpenseField[]) => {
            setIsLoadingFields(false);
            if (selectedProfileName) {
                updateJobData('fields', fetchedFields);
                if (fetchedFields.length > 0 && !formData.bulkPrimaryField) {
                    const best = fetchedFields.find(f => f.is_mandatory && f.data_type === 'text');
                    if (best) updateJobData('bulkPrimaryField', best.api_name);
                }
            }
        });
        return () => { socket.off('apiStatusResult'); socket.off('expenseFieldsFetched'); };
    }, [socket, selectedProfileName, formData.bulkPrimaryField]);

    const handleManualVerify = () => { if (socket && selectedProfileName) { setApiStatus({ status: 'loading', message: 'Verifying connection...' }); socket.emit('checkApiStatus', { selectedProfileName, service: 'expense' }); } };

    const handleStart = () => {
        if (!socket || !selectedProfileName) return;
        setJobs(prev => ({
            ...prev,
            [selectedProfileName]: {
                ...prev[selectedProfileName],
                isProcessing: true,
                isPaused: false,
                isComplete: false,
                results: [],
                totalToProcess: formData.bulkValues.split('\n').filter(x => x.trim()).length,
                processingStartTime: new Date(),
                processingTime: 0
            }
        }));
        
        socket.emit('startBulkExpenseCreation', { 
            selectedProfileName, 
            moduleName: formData.moduleName, 
            primaryFieldName: formData.bulkPrimaryField, 
            bulkValues: formData.bulkValues, 
            defaultData: formData.defaultData, 
            bulkDelay: formData.bulkDelay, 
            verifyLog: formData.verifyLog,
            stopAfterFailures: formData.stopAfterFailures 
        });
    };

    const handlePauseResume = (pause: boolean) => { if (socket && selectedProfileName) { socket.emit(pause ? 'pauseJob' : 'resumeJob', { profileName: selectedProfileName, jobType: 'expense' }); setJobs(prev => ({ ...prev, [selectedProfileName]: { ...prev[selectedProfileName], isPaused: pause } })); } };
    const handleEnd = () => { if (socket && selectedProfileName) { socket.emit('endJob', { profileName: selectedProfileName, jobType: 'expense' }); setJobs(prev => ({ ...prev, [selectedProfileName]: { ...prev[selectedProfileName], isProcessing: false } })); } };

    // --- NEW: Retry Logic ---
    const handleRetryFailed = () => {
        if (!selectedProfileName) return;
        
        const currentJob = activeJob;
        const failedItems = currentJob.results
            .filter(r => !r.success)
            .map(r => r.primaryValue)
            .join('\n');

        if (!failedItems) {
            toast({ title: "No failed items found", variant: "default" });
            return;
        }

        // 1. Update the bulkValues with ONLY the failed items
        updateJobData('bulkValues', failedItems);
        
        // 2. Reset the job state so it's ready to start again
        setJobs(prev => ({
            ...prev,
            [selectedProfileName]: {
                ...prev[selectedProfileName],
                isProcessing: false,
                isPaused: false,
                isComplete: false,
                results: [],      // Clear previous results
                processingTime: 0,
                totalToProcess: failedItems.split('\n').length
            }
        }));

        toast({ title: "Ready to Retry", description: "Loaded failed items into the input. Click Start to try again." });
    };

    return (
        <>
            <DashboardLayout onAddProfile={onAddProfile} onEditProfile={onEditProfile} onDeleteProfile={onDeleteProfile} profiles={expenseProfiles} selectedProfile={selectedProfile} onProfileChange={setSelectedProfileName} apiStatus={apiStatus} onShowStatus={() => setIsStatusModalOpen(true)} onManualVerify={handleManualVerify} socket={socket} jobs={jobs} service="expense">
                <div className="flex flex-col space-y-6">
                    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold tracking-tight">Expense Custom Module</h1></div>
                    
                    <ExpenseBulkForm 
                        moduleName={formData.moduleName} 
                        setModuleName={(val) => updateJobData('moduleName', val)} 
                        fields={formData.fields || []} 
                        isLoadingFields={isLoadingFields} 
                        onFetchFields={handleFetchFields} 
                        bulkPrimaryField={formData.bulkPrimaryField} 
                        setBulkPrimaryField={(val) => updateJobData('bulkPrimaryField', val)} 
                        bulkValues={formData.bulkValues} 
                        setBulkValues={(val) => updateJobData('bulkValues', val)} 
                        bulkDelay={formData.bulkDelay} 
                        setBulkDelay={(val) => updateJobData('bulkDelay', val)} 
                        defaultData={formData.defaultData} 
                        onDefaultDataChange={(k, v) => updateJobData('defaultData', { ...formData.defaultData, [k]: v })} 
                        verifyLog={formData.verifyLog} 
                        setVerifyLog={(val) => updateJobData('verifyLog', val)} 
                        stopAfterFailures={formData.stopAfterFailures} 
                        setStopAfterFailures={(val) => updateJobData('stopAfterFailures', val)}
                        onStart={handleStart} 
                        onPause={() => handlePauseResume(true)} 
                        onResume={() => handlePauseResume(false)} 
                        onEnd={handleEnd} 
                        isProcessing={activeJob.isProcessing} 
                        isPaused={activeJob.isPaused} 
                        
                        // Pass the new handler
                        onRetryFailed={handleRetryFailed}
                        // Pass failed count to disable button if 0
                        failedCount={activeJob.results.filter(r => !r.success).length}
                    />

                    {/* --- FIX: Passed local state filterText --- */}
                    <ExpenseResultsDisplay 
                        results={activeJob.results}
                        isProcessing={activeJob.isProcessing}
                        isComplete={activeJob.isComplete}
                        totalToProcess={activeJob.totalToProcess || 0}
                        countdown={activeJob.countdown}
                        processingTime={activeJob.processingTime || 0}
                        filterText={filterText} 
                        onFilterTextChange={setFilterText}
                        primaryFieldLabel={formData.fields.find(f => f.api_name === formData.bulkPrimaryField)?.label || 'Primary Field'}
                    />
                </div>
            </DashboardLayout>
            <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>Live status of the connection to Zoho Expense.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.toUpperCase()}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2">Full Response from Server:</h4><pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-xs font-mono border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<DialogFooter><Button onClick={() => setIsStatusModalOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
        </>
    );
};

export default ExpenseCustomModule;