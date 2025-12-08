// --- FILE: src/pages/ExpenseStatus.tsx (FIXED) ---
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../hooks/use-toast';
// --- FIX: Added CardDescription to imports ---
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Separator } from '../components/ui/separator';
import { Textarea } from '../components/ui/textarea';
import { Receipt, CheckCircle2, XCircle, Loader2, Send, Search, Terminal, AlertCircle } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { Profile } from '../App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface ExpenseResult {
    id: string; // Unique ID for the row (can be recordId or index)
    primaryValue: string; // Value of the bulk field (e.g., email)
    status: 'pending' | 'success' | 'failed' | 'waiting';
    recordId?: string;
    logMessage?: string;
    error?: string;
    fullRecord?: any;
}

const ExpenseStatus: React.FC<ExpenseStatusProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
    const { toast } = useToast();
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [moduleName, setModuleName] = useState('');
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    
    const [apiStatus, setApiStatus] = useState<ApiStatus>({ 
        status: 'loading', 
        message: 'Initializing...', 
        fullResponse: null 
    });

    // UI State
    const [isLoadingFields, setIsLoadingFields] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

    // Data State
    const [fields, setFields] = useState<ExpenseField[]>([]);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [waitForLogs, setWaitForLogs] = useState(true);
    
    // Bulk Operation State
    const [bulkField, setBulkField] = useState<string | null>(null); // The field selected for bulk ops
    const [bulkValues, setBulkValues] = useState(''); // Textarea content
    const [results, setResults] = useState<ExpenseResult[]>([]);

    // Fetch profiles
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

    // Auto-select profile
    useEffect(() => {
        if (expenseProfiles.length > 0) {
            if (!selectedProfileName || !expenseProfiles.find(p => p.profileName === selectedProfileName)) {
                setSelectedProfileName(expenseProfiles[0].profileName);
            }
        }
    }, [expenseProfiles, selectedProfileName]);

    // Auto-fill module name
    useEffect(() => {
        const profile = expenseProfiles.find(p => p.profileName === selectedProfileName);
        if (profile?.expense?.moduleApiName) {
            setModuleName(profile.expense.moduleApiName);
        }
        if (profile && socket?.connected) {
             handleCheck(profile.profileName);
        }
    }, [selectedProfileName, expenseProfiles, socket?.connected]);

    // Socket Listeners
    useEffect(() => {
        if (!socket) return;

        const handleStatusResult = (data: any) => {
            if (data.success) {
                setApiStatus({ status: 'success', message: 'Connected', fullResponse: data.fullResponse });
            } else {
                setApiStatus({ status: 'error', message: data.message || 'Failed', fullResponse: data.fullResponse });
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
            // This handler is now for SINGLE record creation logic, 
            // but we are repurposing it to update the specific row in the results table.
            
            setResults(prev => prev.map(res => {
                // Update the row that is 'waiting' OR matches the primary value
                // Since this simple implementation processes sequentially or one-by-one, 
                // matching 'waiting' status is a decent heuristic if we don't have a unique ID passed back from server event yet.
                // ideally, we'd pass a correlation ID to the server and back.
                
                if (res.status === 'waiting') {
                    const isSuccess = data.success && (data.logFound !== false); // Success only if log found (if verifying)
                    return {
                        ...res,
                        status: isSuccess ? 'success' : 'failed',
                        recordId: data.recordId,
                        logMessage: data.logMessage || data.debugMessage || data.error,
                        fullRecord: data.fullRecord
                    };
                }
                return res;
            }));

            if (!bulkField) {
                 setIsSubmitting(false);
                 setStatusMessage('');
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
    }, [socket, toast, bulkField]);

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
        setBulkField(null); // Reset bulk selection
        socket.emit('getExpenseFields', { selectedProfileName, moduleName });
    };

    const handleInputChange = (apiName: string, value: string) => {
        setFormData(prev => ({ ...prev, [apiName]: value }));
    };

    // --- BULK LOGIC ---
    const handleSelectBulkField = (fieldApiName: string) => {
        setBulkField(fieldApiName);
        setIsSearchModalOpen(false);
        toast({ title: "Bulk Mode Activated", description: `Selected '${fieldApiName}' as the unique identifier.` });
    };

    const processQueue = async (queue: string[]) => {
        if (queue.length === 0) {
            setIsSubmitting(false);
            setStatusMessage('All Done');
            toast({ title: "Bulk Operation Complete" });
            return;
        }

        const currentValue = queue[0];
        const remainingQueue = queue.slice(1);

        // Update UI to show we are processing this item
        setResults(prev => [...prev, { 
            id: Math.random().toString(36).substr(2, 9), 
            primaryValue: currentValue, 
            status: 'waiting',
            logMessage: 'Sending...'
        }]);

        // Prepare Data
        const currentData = { ...formData, [bulkField!]: currentValue };
        // Clean empty
        const cleanData: Record<string, any> = {};
        Object.keys(currentData).forEach(key => {
            if(currentData[key] && currentData[key].trim() !== "") cleanData[key] = currentData[key];
        });

        // Emit
        socket?.emit('createExpenseRecord', { 
            selectedProfileName, 
            moduleName, 
            formData: cleanData, 
            waitForLog: waitForLogs,
            // We rely on the 10s wait in server, so we don't need to pass primaryValue for server logic,
            // but the client-side queue needs to wait.
        });

        // Wait a bit before next (simple throttle) + wait for socket response logically
        // In a real app, we'd wait for the socket 'expenseCreateResult' event before proceeding.
        // For this demo, we use a timeout that matches the server's wait time + buffer.
        
        setTimeout(() => {
            processQueue(remainingQueue);
        }, 11000); // 11 seconds (10s server wait + 1s buffer)
    };

    const handleSubmit = () => {
        if (!socket || !selectedProfileName || !moduleName) return;
        
        setResults([]); // Clear previous results
        setIsSubmitting(true);
        setStatusMessage('Starting...');

        if (bulkField && bulkValues.trim()) {
            // BULK MODE
            const values = bulkValues.split('\n').map(v => v.trim()).filter(v => v);
            processQueue(values);
        } else {
            // SINGLE MODE
            const cleanData: Record<string, any> = {};
            Object.keys(formData).forEach(key => {
                if(formData[key].trim() !== "") cleanData[key] = formData[key];
            });

            setResults([{ 
                id: 'single', 
                primaryValue: 'Single Record', 
                status: 'waiting',
                logMessage: 'Creating...'
            }]);

            socket.emit('createExpenseRecord', { 
                selectedProfileName, 
                moduleName, 
                formData: cleanData, 
                waitForLog: waitForLogs 
            });
        }
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
            <div className="container mx-auto max-w-6xl space-y-6 animate-in fade-in-50 duration-500">
                
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
                                <div className="flex space-x-2 items-center">
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
                                    <Button onClick={handleLoadFields} disabled={isLoadingFields || !moduleName || isSubmitting} variant="secondary">
                                        {isLoadingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load Fields"}
                                    </Button>
                                    {/* SEARCH ICON FOR BULK FIELD SELECTION */}
                                    <Button 
                                        onClick={() => setIsSearchModalOpen(true)} 
                                        disabled={fields.length === 0 || isSubmitting}
                                        variant="outline"
                                        title="Select field for Bulk Operation"
                                    >
                                        <Search className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* LEFT: Input Form */}
                    <Card className="lg:col-span-1 border-primary/20 shadow-md">
                        <CardHeader className="bg-muted/30 pb-4">
                            <CardTitle className="text-lg flex items-center justify-between">
                                <span className="flex items-center"><Send className="mr-2 h-5 w-5 text-primary" /> Create Record</span>
                                {bulkField && <Badge variant="secondary">Bulk Mode: {bulkField}</Badge>}
                            </CardTitle>
                            <CardDescription>
                                {bulkField ? "Enter values below (one per line)" : `Enter values for ${moduleName}`}
                            </CardDescription>
                        </CardHeader>
                        
                        <CardContent className="pt-6 space-y-4 max-h-[600px] overflow-y-auto">
                            {/* IF BULK MODE: Show Textarea for the bulk field */}
                            {bulkField && (
                                <div className="space-y-2 p-3 bg-blue-50/50 rounded border border-blue-100">
                                    <Label htmlFor="bulkInput" className="text-blue-700 font-semibold">
                                        {fields.find(f => f.api_name === bulkField)?.label || bulkField} (Bulk Values)
                                    </Label>
                                    <Textarea 
                                        id="bulkInput"
                                        value={bulkValues}
                                        onChange={(e) => setBulkValues(e.target.value)}
                                        placeholder="Value 1&#10;Value 2&#10;Value 3..."
                                        rows={10}
                                        className="font-mono text-sm"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            )}

                            {/* Standard Fields (Hide the bulk field if selected) */}
                            {fields.map(field => {
                                if (field.api_name === bulkField) return null; // Skip bulk field here
                                return (
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
                                );
                            })}
                            
                            {fields.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground italic">
                                    Load fields to view form.
                                </div>
                            )}
                        </CardContent>
                        
                        {fields.length > 0 && (
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
                                            Verify Automation (10s Wait)
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground">
                                            Create -> Wait 10s -> Check 'cf_api_log'
                                        </p>
                                    </div>
                                </div>
                                <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {statusMessage || 'Processing...'}</>
                                    ) : (
                                        bulkField ? `Process ${bulkValues.split('\n').filter(x=>x.trim()).length} Records` : 'Create Record'
                                    )}
                                </Button>
                            </CardFooter>
                        )}
                    </Card>

                    {/* RIGHT: Results Table */}
                    <Card className="lg:col-span-2 h-full flex flex-col border-dashed">
                        <CardHeader className="pb-2 bg-muted/20">
                            <CardTitle className="text-base flex items-center justify-between">
                                <span className="flex items-center"><Terminal className="mr-2 h-4 w-4" /> Results</span>
                                {results.length > 0 && (
                                    <Badge variant="outline">{results.length} processed</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 overflow-hidden min-h-[500px]">
                            <ScrollArea className="h-full">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="w-[50px]">#</TableHead>
                                            <TableHead>{bulkField ? 'Primary Value' : 'Record'}</TableHead>
                                            <TableHead className="w-[100px]">Status</TableHead>
                                            <TableHead>Record ID</TableHead>
                                            <TableHead>Log / Message</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {results.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                                                    No results yet. Start a process to see details.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        {results.map((res, idx) => (
                                            <TableRow 
                                                key={idx} 
                                                className={
                                                    res.status === 'success' ? 'bg-green-50/50 hover:bg-green-50' : 
                                                    res.status === 'failed' ? 'bg-red-50/50 hover:bg-red-50' : 
                                                    ''
                                                }
                                            >
                                                <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                <TableCell className="font-medium">{res.primaryValue}</TableCell>
                                                <TableCell>
                                                    {res.status === 'waiting' && <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Loader2 className="h-3 w-3 mr-1 animate-spin"/> Checking</Badge>}
                                                    {res.status === 'success' && <Badge variant="success" className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1"/> Success</Badge>}
                                                    {res.status === 'failed' && <Badge variant="destructive" className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1"/> Failed</Badge>}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{res.recordId || '-'}</TableCell>
                                                <TableCell className="text-xs max-w-[200px] truncate" title={res.logMessage}>
                                                    {res.logMessage}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* FULL RESPONSE MODAL (Sidebar) */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Zoho Expense API Response</DialogTitle>
                        <DialogDescription>
                            Raw data from connectivity check.
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

            {/* FIELD SELECTION MODAL */}
            <Dialog open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Select Primary Field</DialogTitle>
                        <DialogDescription>
                            Choose a field to use as the dynamic input for bulk creation (e.g., Email, Name).
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[300px] mt-2 border rounded-md p-2">
                        <div className="space-y-1">
                            {fields.map((f) => (
                                <Button
                                    key={f.api_name}
                                    variant="ghost"
                                    className="w-full justify-start text-sm"
                                    onClick={() => handleSelectBulkField(f.api_name)}
                                >
                                    <span className="font-medium mr-2">{f.label}</span>
                                    <span className="text-xs text-muted-foreground font-mono">({f.api_name})</span>
                                </Button>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="sm:justify-start">
                        <Button type="button" variant="secondary" onClick={() => setIsSearchModalOpen(false)}>
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </DashboardLayout>
    );
};

export default ExpenseStatus;