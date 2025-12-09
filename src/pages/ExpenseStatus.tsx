// --- FILE: src/pages/ExpenseStatus.tsx (FIXED) ---
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Separator } from '../components/ui/separator';
import { Receipt, CheckCircle2, XCircle, Loader2, Send, Search, Terminal } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Profile } from '../App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

const SERVER_URL = "http://localhost:3000";

interface ExpenseStatusProps {
    socket: Socket | null;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

// Define the type to match DashboardLayout's expectation
type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

interface ExpenseField {
    field_id: string;
    label: string;
    api_name: string;
    index: number;
    type: string;
    is_active: boolean;
    is_mandatory: boolean;
    is_read_only: boolean;
    data_type_formatted: string;
    placeholder?: string;
}

interface LogResult {
    success: boolean;
    recordId?: string;
    logFound?: boolean;
    logMessage?: string;
    debugMessage?: string;
    error?: string;
    fullRecord?: any;
}

const ExpenseStatus: React.FC<ExpenseStatusProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
    const { toast } = useToast();
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [moduleName, setModuleName] = useState('');
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    
    // Unified status state for both Page and Sidebar
    // FIX: Start as 'idle', not 'loading', so it doesn't get stuck if no profile is selected
    const [apiStatus, setApiStatus] = useState<ApiStatus>({ 
        status: 'loading', // Will switch to loading immediately when check starts
        message: 'Initializing...', 
        fullResponse: null 
    });

    // UI State for Form
    const [isLoadingFields, setIsLoadingFields] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Data State
    const [fields, setFields] = useState<ExpenseField[]>([]);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [waitForLogs, setWaitForLogs] = useState(true);
    const [result, setResult] = useState<LogResult | null>(null);

    // Fetch profiles internally
    const { data: profiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error('Could not connect to the server.');
            return response.json();
        },
        refetchOnWindowFocus: false,
    });

    const expenseProfiles = useMemo(() => {
        return profiles.filter(p => p.expense && p.expense.orgId);
    }, [profiles]);

    // Auto-select first VALID profile
    useEffect(() => {
        if (expenseProfiles.length > 0) {
            if (!selectedProfileName || !expenseProfiles.find(p => p.profileName === selectedProfileName)) {
                setSelectedProfileName(expenseProfiles[0].profileName);
            }
        }
    }, [expenseProfiles, selectedProfileName]);

    // Update module name input when profile changes
    useEffect(() => {
        const profile = expenseProfiles.find(p => p.profileName === selectedProfileName);
        if (profile?.expense?.moduleApiName) {
            setModuleName(profile.expense.moduleApiName);
        }
        
        // FIX: Trigger status check when profile changes automatically
        if (profile && socket?.connected) {
             handleCheck(profile.profileName);
        }
    }, [selectedProfileName, expenseProfiles, socket?.connected]); // Added socket dependency


    // Handle Socket Results
    useEffect(() => {
        if (!socket) return;

        const handleStatusResult = (data: any) => {
            // FIX: Accept ANY success as connected (even without moduleDetails)
            if (data.success) {
                setApiStatus({
                    status: 'success',
                    message: 'Connected to Zoho Expense',
                    fullResponse: data.fullResponse
                });
                // Optional: Only toast if user manually clicked, otherwise it's annoying on auto-load
                // toast({ title: "Connected!", description: "Zoho Expense is reachable." });
            } else {
                setApiStatus({
                    status: 'error',
                    message: data.message || 'Connection Failed',
                    fullResponse: data.fullResponse
                });
                if (apiStatus.status === 'loading') { // Only toast if we were waiting
                    toast({ title: "Connection Failed", description: data.message, variant: "destructive" });
                }
            }
        };

        const handleFieldsResult = (data: { success: boolean, fields?: ExpenseField[], error?: string }) => {
            setIsLoadingFields(false);
            if (data.success && data.fields) {
                const editableFields = data.fields.filter(f => !f.is_read_only && f.is_active);
                setFields(editableFields);
                toast({ title: "Fields Loaded", description: `Found ${editableFields.length} active fields.` });
            } else {
                setFields([]);
                toast({ title: "Error Fetching Fields", description: data.error, variant: "destructive" });
            }
        };

        const handleLogStatus = (data: { status: string, message: string }) => {
            setStatusMessage(data.message);
        };

        const handleCreateResult = (data: any) => {
            setIsSubmitting(false);
            setStatusMessage('');
            setResult(data);
            if (data.success) {
                toast({ title: "Process Complete", description: `Record ID: ${data.recordId}` });
            } else {
                toast({ title: "Process Failed", description: data.error, variant: "destructive" });
            }
        };

        socket.on('apiStatusResult', handleStatusResult);
        socket.on('expenseFieldsResult', handleFieldsResult);
        socket.on('expenseLogStatus', handleLogStatus);
        socket.on('expenseCreateResult', handleCreateResult);

        return () => {
            socket.off('apiStatusResult', handleStatusResult);
            socket.off('expenseFieldsResult');
            socket.off('expenseLogStatus');
            socket.off('expenseCreateResult');
        };
    }, [socket, toast]); // Removed apiStatus dependency to prevent stale closures

    const handleCheck = (profileNameOverride?: string) => {
        const targetProfile = profileNameOverride || selectedProfileName;
        if (!socket || !targetProfile) return;
        
        setApiStatus(prev => ({ ...prev, status: 'loading', message: 'Checking...' }));
        socket.emit('checkApiStatus', { selectedProfileName: targetProfile, service: 'expense' });
    };

    const handleLoadFields = () => {
        if (!socket || !selectedProfileName || !moduleName) return;
        setIsLoadingFields(true);
        setFields([]);
        setResult(null);
        socket.emit('getExpenseFields', { selectedProfileName, moduleName });
    };

    const handleInputChange = (apiName: string, value: string) => {
        setFormData(prev => ({ ...prev, [apiName]: value }));
    };

    const handleSubmit = () => {
        if (!socket || !selectedProfileName || !moduleName) return;
        
        const cleanData: Record<string, any> = {};
        Object.keys(formData).forEach(key => {
            if(formData[key].trim() !== "") cleanData[key] = formData[key];
        });

        setIsSubmitting(true);
        setResult(null);
        setStatusMessage('Creating Record...');
        
        socket.emit('createExpenseRecord', { 
            selectedProfileName, 
            moduleName, 
            formData: cleanData,
            waitForLog: waitForLogs
        });
    };

    const selectedProfile = profiles.find(p => p.profileName === selectedProfileName) || null;

    return (
        <DashboardLayout
            profiles={profiles} 
            selectedProfile={selectedProfile}
            onAddProfile={onAddProfile}
            onProfileChange={setSelectedProfileName}
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
            socket={socket}
            jobs={{}} 
            onShowStatus={() => setIsDetailsOpen(true)} 
            onManualVerify={() => handleCheck()} 
            apiStatus={apiStatus} 
            service="expense" 
        >
            <div className="container mx-auto max-w-4xl space-y-6 animate-in fade-in-50 duration-500">
                
                {/* Header */}
                <div className="flex items-center space-x-4 mb-2">
                    <div className="p-3 bg-green-100 rounded-lg">
                        <Receipt className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Custom Module Manager</h1>
                        <p className="text-muted-foreground">Interact with Zoho Expense custom modules, create records, and inspect logs.</p>
                    </div>
                </div>

                {/* Step 1: Configuration */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-medium text-muted-foreground uppercase tracking-wide">Step 1: Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Target Profile</Label>
                                <select 
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                                    value={selectedProfileName}
                                    onChange={(e) => setSelectedProfileName(e.target.value)}
                                    disabled={isSubmitting}
                                >
                                    {expenseProfiles.length === 0 && <option value="">No Expense Profiles Found</option>}
                                    {expenseProfiles.map(p => (
                                        <option key={p.profileName} value={p.profileName}>{p.profileName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Module API Name</Label>
                                <div className="flex space-x-2">
                                    <Input 
                                        value={moduleName} 
                                        onChange={(e) => setModuleName(e.target.value)} 
                                        placeholder="e.g., cm_test_module"
                                        disabled={isSubmitting}
                                    />
                                    <Button onClick={handleLoadFields} disabled={isLoadingFields || !moduleName || isSubmitting}>
                                        {isLoadingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* LEFT: Input Form */}
                    {fields.length > 0 ? (
                        <Card className="lg:col-span-1 border-primary/20 shadow-md">
                            <CardHeader className="bg-muted/30 pb-4">
                                <CardTitle className="text-lg flex items-center">
                                    <Send className="mr-2 h-5 w-5 text-primary" /> Create Record
                                </CardTitle>
                                <CardDescription>Enter values for <strong>{moduleName}</strong></CardDescription>
                            </CardHeader>
                            <CardContent className="pt-6 space-y-4 max-h-[600px] overflow-y-auto">
                                {fields.map(field => (
                                    <div key={field.api_name} className="space-y-2">
                                        <Label htmlFor={field.api_name} className="text-xs font-medium uppercase text-muted-foreground">
                                            {field.label}
                                            {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                                        </Label>
                                        <Input 
                                            id={field.api_name}
                                            value={formData[field.api_name] || ''}
                                            onChange={(e) => handleInputChange(field.api_name, e.target.value)}
                                            placeholder={field.data_type_formatted || field.type}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                ))}
                            </CardContent>
                            <Separator />
                            <CardFooter className="pt-4 flex-col items-start space-y-4 bg-muted/10">
                                <div className="flex items-center space-x-2 bg-yellow-50 p-2 rounded border border-yellow-200 w-full">
                                    <Checkbox 
                                        id="waitForLogs" 
                                        checked={waitForLogs} 
                                        onCheckedChange={(c) => setWaitForLogs(!!c)} 
                                        disabled={isSubmitting}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="waitForLogs" className="text-sm font-medium leading-none cursor-pointer">
                                            Wait & Inspect Log
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground">
                                            Wait 10s after creation to check 'cf_api_log'
                                        </p>
                                    </div>
                                </div>
                                <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {statusMessage || 'Processing...'}</>
                                    ) : (
                                        'Create Record'
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    ) : (
                        <div className="lg:col-span-1 h-40 flex items-center justify-center border-2 border-dashed rounded-lg text-muted-foreground">
                            Load module fields to start.
                        </div>
                    )}

                    {/* RIGHT: Results Console */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="h-full border-dashed min-h-[400px]">
                            <CardHeader className="pb-2 bg-muted/20">
                                <CardTitle className="text-base flex items-center">
                                    <Terminal className="mr-2 h-4 w-4" /> Console / Result
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4">
                                {!result && !isSubmitting && (
                                    <div className="h-40 flex items-center justify-center text-muted-foreground text-sm italic">
                                        Waiting for action...
                                    </div>
                                )}

                                {isSubmitting && (
                                    <div className="h-40 flex flex-col items-center justify-center text-primary animate-pulse">
                                        <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                                        <p className="text-sm font-medium">{statusMessage}</p>
                                    </div>
                                )}

                                {result && (
                                    <div className="space-y-4 animate-in fade-in-50">
                                        <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                            <div className="flex items-center mb-2">
                                                {result.success ? <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" /> : <XCircle className="h-5 w-5 text-red-600 mr-2" />}
                                                <span className="font-bold text-lg">{result.success ? 'Success' : 'Error'}</span>
                                            </div>
                                            {result.success && <p className="text-sm text-green-800">Record ID: <span className="font-mono font-bold">{result.recordId}</span></p>}
                                            {!result.success && <p className="text-sm text-red-800">{result.error}</p>}
                                        </div>

                                        {/* Log Inspection Result */}
                                        {result.logFound !== undefined && (
                                            <div className={`p-4 rounded-lg border ${result.logFound ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                                                <h4 className={`text-sm font-bold mb-2 ${result.logFound ? 'text-blue-700' : 'text-orange-700'}`}>
                                                    Log Inspection ({result.logFound ? 'Found' : 'Missing'})
                                                </h4>
                                                
                                                {result.logFound ? (
                                                    <pre className="text-xs bg-white p-2 rounded border border-blue-100 overflow-x-auto whitespace-pre-wrap">
                                                        {result.logMessage}
                                                    </pre>
                                                ) : (
                                                    <p className="text-xs text-orange-800">{result.debugMessage}</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Full JSON Dump */}
                                        <div className="mt-4">
                                            <Label className="text-xs text-muted-foreground mb-1 block">Full API Response</Label>
                                            <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg text-[10px] font-mono h-60 overflow-auto">
                                                {JSON.stringify(result.fullRecord || result, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            {/* FULL RESPONSE MODAL */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Zoho Expense API Response</DialogTitle>
                        <DialogDescription>
                            Raw data returned from the <strong>/settings/fields</strong> or connectivity check endpoint.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto bg-muted/50 p-4 rounded-md border text-xs font-mono">
                        <pre className="whitespace-pre-wrap break-all">
                            {JSON.stringify(apiStatus.fullResponse, null, 2)}
                        </pre>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
};

export default ExpenseStatus;