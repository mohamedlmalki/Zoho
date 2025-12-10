import React, { useState, useEffect } from 'react';
// Using @ alias for imports to match project configuration
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Receipt, Play, TerminalSquare, AlertCircle, CheckCircle2, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile } from '@/App';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const SERVER_URL = "http://localhost:3000";

interface ExpenseTestProps {
    socket: Socket | null;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

const ExpenseTest: React.FC<ExpenseTestProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
    // 1. Fetch Profiles
    const { 
        data: profiles = [], 
        isLoading: isLoadingProfiles, 
        isError, 
        error,
        refetch 
    } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            return response.json();
        },
    });

    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<{ success: boolean; message: string; fullResponse?: any } | null>(null);

    // --- New State for Accounts ---
    const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<string>('');
    const [accountError, setAccountError] = useState<string | null>(null); // NEW: Track account errors

    // 2. Auto-select profile
    useEffect(() => {
        if (profiles.length > 0 && !selectedProfileName) {
            setSelectedProfileName(profiles[0].profileName);
        }
        if (profiles.length > 0 && selectedProfileName && !profiles.find(p => p.profileName === selectedProfileName)) {
            setSelectedProfileName(profiles[0].profileName);
        }
    }, [profiles, selectedProfileName]);

    const selectedProfile = profiles.find(p => p.profileName === selectedProfileName) || null;

    // 3. Socket Listeners (Results & Accounts)
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

        // NEW: Handle Account List
        const handleAccountsFetched = (data: { id: string; name: string }[]) => {
            console.log("[ExpenseTest] 📥 Received 'expenseAccountsFetched':", data);
            setAccounts(data);
            setLoadingAccounts(false);
            setAccountError(null); // Clear errors on success
        };

        // NEW: Handle Errors explicitly
        const handleExpenseError = (data: { message: string, fullResponse?: any }) => {
            console.error("[ExpenseTest] 💥 Received 'expenseError':", data);
            setAccountError(data.message);
            setLoadingAccounts(false);
            setAccounts([]);
        };

        socket.on('expenseTestUpdate', handleUpdate);
        socket.on('expenseTestResult', handleResult);
        socket.on('expenseAccountsFetched', handleAccountsFetched);
        socket.on('expenseError', handleExpenseError);

        return () => {
            socket.off('expenseTestUpdate', handleUpdate);
            socket.off('expenseTestResult', handleResult);
            socket.off('expenseAccountsFetched', handleAccountsFetched);
            socket.off('expenseError', handleExpenseError);
        };
    }, [socket]);

    // 4. Trigger Account Fetch when Profile Changes
    useEffect(() => {
        if (selectedProfile && socket) {
            console.log("[ExpenseTest] 🔄 Profile changed to:", selectedProfile.profileName);
            setLoadingAccounts(true);
            setAccounts([]); 
            setSelectedAccount('');
            setAccountError(null);
            console.log("[ExpenseTest] 📡 Emitting 'getExpenseAccounts'...");
            socket.emit('getExpenseAccounts', { selectedProfileName: selectedProfile.profileName });
        }
    }, [selectedProfile, socket]);


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

    if (isLoadingProfiles) {
        return <div className="flex h-screen items-center justify-center gap-2"><Loader2 className="h-8 w-8 animate-spin" /> Loading Profiles...</div>;
    }

    if (isError) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <h2 className="text-xl font-bold text-red-600">Failed to Load Profiles</h2>
                <Button onClick={() => refetch()} variant="outline"><RefreshCw className="mr-2 h-4 w-4" /> Try Again</Button>
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
                    <Alert variant="destructive" className="border-orange-200 bg-orange-50 text-orange-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Profiles Found</AlertTitle>
                        <AlertDescription>Add a Zoho Account to continue.</AlertDescription>
                    </Alert>
                ) : (
                    <>
                        {/* --- NEW CARD: SELECT ACCOUNT --- */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/20">
                                        <Wallet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <CardTitle>Expense Accounts (Paid Through)</CardTitle>
                                        <CardDescription>
                                            Fetches valid "Paid Through" accounts from Zoho Expense for this profile.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col gap-2 max-w-sm">
                                    <Label>Select Account</Label>
                                    <Select 
                                        value={selectedAccount} 
                                        onValueChange={setSelectedAccount}
                                        disabled={loadingAccounts || accounts.length === 0}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={loadingAccounts ? "Loading accounts..." : "Select an account"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {accounts.map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>
                                                    {acc.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    
                                    {/* --- Error / Info Messages --- */}
                                    {accountError && (
                                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200 mt-2">
                                            <strong>Error:</strong> {accountError}
                                        </div>
                                    )}
                                    {accounts.length === 0 && !loadingAccounts && !accountError && (
                                        <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                                            No 'Paid Through' accounts found for this profile. 
                                            <br/>
                                            Check your Zoho Expense settings or try a different profile.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* --- EXISTING CARD: CUSTOM MODULE TEST --- */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/20">
                                        <Receipt className="h-6 w-6 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div>
                                        <CardTitle>Zoho Expense Custom Module Test</CardTitle>
                                        <CardDescription>
                                            Automated verification of Deluge scripts.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col gap-4">
                                    <div className="flex gap-4">
                                        <Button 
                                            onClick={handleRunTest} 
                                            disabled={isRunning || !selectedProfile?.expense?.orgId} 
                                            className="w-full md:w-auto self-start"
                                        >
                                            {isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</> : <><Play className="mr-2 h-4 w-4" />Run Integration Test</>}
                                        </Button>
                                    </div>
                                    
                                    {!selectedProfile?.expense?.orgId && (
                                        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                            <AlertCircle className="h-4 w-4" />
                                            <span>Zoho Expense Org ID is missing.</span>
                                        </div>
                                    )}

                                    <div className="mt-4 rounded-md border bg-muted p-4 font-mono text-sm">
                                        <ScrollArea className="h-[200px]">
                                            {logs.length === 0 ? <span className="text-muted-foreground/50 italic">Ready to start...</span> : logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                                        </ScrollArea>
                                    </div>
                                    
                                    {result && (
                                        <Alert variant={result.success ? "default" : "destructive"}>
                                            <AlertTitle>{result.success ? "Passed" : "Failed"}</AlertTitle>
                                            <AlertDescription>{result.message}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};

export default ExpenseTest;