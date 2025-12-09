import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Profile, ExpenseJobState } from '@/App';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Fixes for named exports: DashboardLayout, ProfileSelector, ExpenseBulkForm, ExpenseResultsDisplay
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'; 
import { ProfileSelector } from '@/components/dashboard/ProfileSelector';
import { ExpenseBulkForm } from '@/components/dashboard/expense/ExpenseBulkForm';
import { ExpenseResultsDisplay } from '@/components/dashboard/expense/ExpenseResultsDisplay';


interface ExpenseStatusProps {
    socket: Socket | null;
    jobs: { [key: string]: ExpenseJobState };
    setJobs: React.Dispatch<React.SetStateOf<ExpenseJobState>>;
    createInitialJobState: () => ExpenseJobState;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

const ExpenseStatus: React.FC<ExpenseStatusProps> = ({ 
    socket, 
    jobs, 
    setJobs,
    createInitialJobState,
    onAddProfile, 
    onEditProfile, 
    onDeleteProfile 
}) => {
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [apiStatus, setApiStatus] = useState<any>(null);
    const [isChecking, setIsChecking] = useState(false);

    // Function to check API status for the selected profile
    const checkApiStatus = async (profileName: string) => {
        if (!socket || !profileName) {
            setApiStatus(null);
            return;
        }

        setIsChecking(true);
        setApiStatus(null);

        return new Promise<any>((resolve, reject) => {
            socket.emit('checkApiStatus', { selectedProfileName: profileName, service: 'expense' });

            socket.once('apiStatusResult', (result: any) => {
                setIsChecking(false);
                setApiStatus(result);
                resolve(result);
            });
            setTimeout(() => {
                // Handle timeout if no response after a few seconds
                if (isChecking) {
                     setIsChecking(false);
                     reject(new Error("API status check timed out."));
                }
            }, 10000); 
        });
    };

    // Use React Query to manage fetching status when profile changes
    const { data: statusData, refetch: refetchStatus } = useQuery({
        queryKey: ['expenseApiStatus', selectedProfileName],
        queryFn: () => checkApiStatus(selectedProfileName),
        enabled: !!selectedProfileName,
        initialData: apiStatus,
    });
    
    // Manual refetch trigger when profile name changes
    React.useEffect(() => {
        if (selectedProfileName) {
            refetchStatus();
        }
    }, [selectedProfileName, refetchStatus]);

    const activeJob = jobs[selectedProfileName];

    return (
        <DashboardLayout 
            title="Zoho Expense Bulk Operations" 
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
        >
            <div className="flex flex-col space-y-6">
                
                {/* 1. Profile and Status Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>API Configuration Status</CardTitle>
                        <CardDescription>Select a profile to begin configuring bulk expense records.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ProfileSelector 
                            selectedProfileName={selectedProfileName}
                            setSelectedProfileName={setSelectedProfileName}
                            service="expense"
                            onStatusCheck={() => refetchStatus()}
                            isChecking={isChecking}
                        />

                        {statusData && (
                            <Alert className="mt-4" variant={statusData.success ? 'default' : 'destructive'}>
                                <Terminal className="h-4 w-4" />
                                <AlertTitle>{statusData.success ? 'Connection Successful!' : 'Connection Failed'}</AlertTitle>
                                <AlertDescription>
                                    {statusData.message}
                                    {statusData.success && statusData.fullResponse?.moduleDetails && (
                                        <div className="mt-2 text-sm">
                                            <p>Module: <strong>{statusData.fullResponse.moduleDetails.name}</strong> ({statusData.fullResponse.moduleDetails.fieldCount} fields loaded)</p>
                                        </div>
                                    )}
                                    {statusData.success && !statusData.fullResponse?.moduleDetails && (
                                        <p className="mt-2 text-sm text-yellow-600">
                                            <Info className="h-4 w-4 inline mr-1" /> Warning: Module API Name is not configured in the profile, fields cannot be loaded.
                                        </p>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                {/* 2. Bulk Form (Smart Form, Wait & Inspect Log) */}
                {(statusData?.success && statusData?.fullResponse?.moduleDetails) && (
                    <ExpenseBulkForm
                        socket={socket}
                        selectedProfileName={selectedProfileName}
                        setSelectedProfileName={setSelectedProfileName}
                        jobs={jobs}
                        setJobs={setJobs}
                    />
                )}

                {/* 3. Results Display (Desk-like Table, Polling Status) */}
                {activeJob && (activeJob.isProcessing || activeJob.results.length > 0 || activeJob.isComplete) && (
                    <ExpenseResultsDisplay
                        selectedProfileName={selectedProfileName}
                        jobs={jobs}
                        socket={socket}
                        setJobs={setJobs}
                    />
                )}

            </div>
        </DashboardLayout>
    );
};

export default ExpenseStatus;