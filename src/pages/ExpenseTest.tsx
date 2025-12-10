import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Play, TerminalSquare, AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile } from '@/App';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";

const SERVER_URL = "http://localhost:3000";

interface ExpenseTestProps {
    socket: Socket | null;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

const ExpenseTest: React.FC<ExpenseTestProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
    // 1. Fetch Profiles with Error Handling
    const { 
        data: profiles = [], 
        isLoading: isLoadingProfiles, 
        isError, 
        error,
        refetch 
    } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            console.log("Fetching profiles from:", `${SERVER_URL}/api/profiles`);
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status} ${response.statusText}`);
            }
            return response.json();
        },
    });

    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<{ success: boolean; message: string; fullResponse?: any } | null>(null);

    // 2. Auto-select the first profile when profiles load
    useEffect(() => {
        // If we have profiles but none selected, select the first one
        if (profiles.length > 0 && !selectedProfileName) {
            setSelectedProfileName(profiles[0].profileName);
        }
        // If the selected profile was deleted (no longer in list), reset selection
        if (profiles.length > 0 && selectedProfileName && !profiles.find(p => p.profileName === selectedProfileName)) {
            setSelectedProfileName(profiles[0].profileName);
        }
    }, [profiles, selectedProfileName]);

    // Derived state for the actual profile object
    const selectedProfile = profiles.find(p => p.profileName === selectedProfileName) || null;

    useEffect(() => {
        if (!socket) return;

        const handleUpdate = (data: { message: string }) => {
            setLogs(prev => [...prev, data.message]);
        };

        const handleResult = (data: { success: boolean; message: string; fullResponse?: any }) => {
            setIsRunning(false);
            setResult(data);
            setLogs(prev => [...prev, data.success ? "--- TEST PASSED ---" : "--- TEST FAILED ---"]);
        };

        socket.on('expenseTestUpdate', handleUpdate);
        socket.on('expenseTestResult', handleResult);

        return () => {
            socket.off('expenseTestUpdate', handleUpdate);
            socket.off('expenseTestResult', handleResult);
        };
    }, [socket]);

    const handleRunTest = () => {
        if (!socket || !selectedProfile) {
            alert("No profile selected or not connected to server.");
            return;
        }
        
        setIsRunning(true);
        setLogs(["Starting test sequence..."]);
        setResult(null);

        socket.emit('testExpenseCustomModule', {
            selectedProfileName: selectedProfile.profileName
        });
    };

    // --- Loading State ---
    if (isLoadingProfiles) {
        return <div className="flex h-screen items-center justify-center gap-2"><Loader2 className="h-8 w-8 animate-spin" /> Loading Profiles...</div>;
    }

    // --- Error State ---
    if (isError) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <h2 className="text-xl font-bold text-red-600">Failed to Load Profiles</h2>
                <p className="text-muted-foreground">Could not connect to the server at <code>{SERVER_URL}</code></p>
                <div className="bg-muted p-2 rounded text-xs font-mono">
                    {error instanceof Error ? error.message : 'Unknown error'}
                </div>
                <Button onClick={() => refetch()} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                </Button>
            </div>
        );
    }

    return (
        <DashboardLayout
            onAddProfile={onAddProfile}
            profiles={profiles} 
            selectedProfile={selectedProfile}
            onProfileChange={setSelectedProfileName}
            apiStatus={{ status: 'success', message: '' }} 
            onShowStatus={() => {}}
            onManualVerify={() => {}}
            socket={socket}
            jobs={{}} 
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
            service="inventory" 
        >
            <div className="grid gap-6">
                {profiles.length === 0 ? (
                    // --- EMPTY STATE (Shows if no profiles exist) ---
                    <Alert variant="destructive" className="border-orange-200 bg-orange-50 text-orange-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Profiles Found</AlertTitle>
                        <AlertDescription>
                            You need to add a Zoho Account before you can run tests. 
                            Click <strong>"Add Account"</strong> in the sidebar.
                        </AlertDescription>
                    </Alert>
                ) : (
                    // --- NORMAL STATE ---
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/20">
                                    <Receipt className="h-6 w-6 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <CardTitle>Zoho Expense Custom Module Test</CardTitle>
                                    <CardDescription>
                                        Automated verification of Deluge scripts. Creates a record, waits 10s, and checks for 'cf_api_log'.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4">
                                <Alert>
                                    <TerminalSquare className="h-4 w-4" />
                                    <AlertTitle>How it works</AlertTitle>
                                    <AlertDescription>
                                        1. Uses credentials from: <strong>{selectedProfile?.profileName}</strong><br/>
                                        2. Creates a record in: <strong>{selectedProfile?.expense?.testModuleName || 'cm_testmodule'}</strong><br/>
                                        3. Waits 10 seconds for your backend workflows to run.<br/>
                                        4. Fetches the record and looks for "API LOG" in the <code>cf_api_log</code> field.
                                    </AlertDescription>
                                </Alert>

                                <div className="flex gap-4">
                                    <Button 
                                        onClick={handleRunTest} 
                                        disabled={isRunning || !selectedProfile?.expense?.orgId} 
                                        className="w-full md:w-auto self-start"
                                    >
                                        {isRunning ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Running Test...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="mr-2 h-4 w-4" />
                                                Run Integration Test
                                            </>
                                        )}
                                    </Button>
                                    
                                    <Button variant="outline" onClick={() => refetch()} title="Refresh Profiles">
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </div>
                                
                                {!selectedProfile?.expense?.orgId && (
                                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                        <AlertCircle className="h-4 w-4" />
                                        <span>
                                            Zoho Expense Org ID is missing. Please click 
                                            <Button 
                                                variant="link" 
                                                className="h-auto p-0 px-1 text-amber-700 underline" 
                                                onClick={() => selectedProfile && onEditProfile(selectedProfile)}
                                            >
                                                Edit Profile
                                            </Button> 
                                            to configure it.
                                        </span>
                                    </div>
                                )}

                                <div className="mt-4 rounded-md border bg-muted p-4 font-mono text-sm">
                                    <div className="flex items-center justify-between mb-2 border-b pb-2">
                                        <span className="font-semibold text-muted-foreground">Execution Log</span>
                                        {result && (
                                            <span className={result.success ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                                {result.success ? "SUCCESS" : "FAILED"}
                                            </span>
                                        )}
                                    </div>
                                    <ScrollArea className="h-[200px]">
                                        {logs.length === 0 ? (
                                            <span className="text-muted-foreground/50 italic">Ready to start...</span>
                                        ) : (
                                            logs.map((log, i) => (
                                                <div key={i} className="mb-1 whitespace-pre-wrap">{log}</div>
                                            ))
                                        )}
                                    </ScrollArea>
                                </div>
                                
                                {result && result.message && (
                                    <Alert variant={result.success ? "default" : "destructive"} className={result.success ? "border-green-500 bg-green-50 dark:bg-green-900/10" : ""}>
                                        {result.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4" />}
                                        <AlertTitle>{result.success ? "Verification Passed" : "Verification Failed"}</AlertTitle>
                                        <AlertDescription className="whitespace-pre-wrap font-mono mt-2 text-xs">
                                            {result.message}
                                        </AlertDescription>
                                    </Alert>
                                )}

                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
};

export default ExpenseTest;