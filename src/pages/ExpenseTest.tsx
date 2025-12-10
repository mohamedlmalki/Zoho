// --- FILE: src/pages/ExpenseTest.tsx ---

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Loader2, Play, Database, List } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile } from '@/App';
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

const SERVER_URL = "http://localhost:3000";

interface ExpenseTestProps {
    socket: Socket | null;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
}

interface ExpenseField {
    label: string;
    api_name: string;
    data_type: string;
    is_mandatory: boolean;
    is_system: boolean;
    is_read_only: boolean;
}

interface ResultLog {
    value: string;
    success: boolean;
    message: string;
    id?: string;
}

const ExpenseTest: React.FC<ExpenseTestProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
    // 1. Fetch Profiles
    const { data: profiles = [], isLoading: isLoadingProfiles, refetch } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const res = await fetch(`${SERVER_URL}/api/profiles`);
            return res.json();
        },
    });

    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [moduleName, setModuleName] = useState('cm_testmodule');
    
    // Fields State
    const [fields, setFields] = useState<ExpenseField[]>([]);
    const [loadingFields, setLoadingFields] = useState(false);
    const [selectedField, setSelectedField] = useState<string>(''); // API name of the field to bulk insert
    
    // Bulk State
    const [bulkValues, setBulkValues] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [results, setResults] = useState<ResultLog[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Auto-select profile
    useEffect(() => {
        if (profiles.length > 0 && !selectedProfileName) setSelectedProfileName(profiles[0].profileName);
    }, [profiles, selectedProfileName]);

    const selectedProfile = profiles.find(p => p.profileName === selectedProfileName) || null;

    // Socket Listeners
    useEffect(() => {
        if (!socket) return;

        socket.on('expenseFieldsFetched', (fetchedFields: ExpenseField[]) => {
            setFields(fetchedFields);
            setLoadingFields(false);
            // Auto-select the first mandatory text field if available
            const bestField = fetchedFields.find(f => f.is_mandatory && !f.is_system && f.data_type === 'text');
            if (bestField) setSelectedField(bestField.api_name);
        });

        socket.on('expenseError', (data) => {
            setError(data.message);
            setLoadingFields(false);
            setIsProcessing(false);
        });

        socket.on('expenseBulkUpdate', (data) => {
            setStatusMessage(data.message);
            if (data.progress) setProgress(data.progress);
            if (data.progress === 100) setIsProcessing(false);
        });

        socket.on('expenseBulkResult', (data) => {
            setResults(prev => [{
                value: data.value,
                success: data.success,
                message: data.message,
                id: data.recordId
            }, ...prev]);
        });

        return () => {
            socket.off('expenseFieldsFetched');
            socket.off('expenseError');
            socket.off('expenseBulkUpdate');
            socket.off('expenseBulkResult');
        };
    }, [socket]);

    const handleFetchFields = () => {
        if (!socket || !selectedProfileName) return;
        setLoadingFields(true);
        setError(null);
        setFields([]);
        socket.emit('getExpenseFields', { selectedProfileName, moduleName });
    };

    const handleStartBulk = () => {
        if (!socket || !selectedProfileName || !selectedField || !bulkValues.trim()) return;
        
        setIsProcessing(true);
        setResults([]);
        setProgress(0);
        setStatusMessage("Starting bulk operation...");
        
        socket.emit('startBulkExpenseCreation', {
            selectedProfileName,
            moduleName,
            primaryFieldName: selectedField,
            bulkValues,
            defaultData: {} // Could be expanded later
        });
    };

    if (isLoadingProfiles) return <div className="p-10"><Loader2 className="animate-spin" /> Loading...</div>;

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
            service="expense" 
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
                
                {/* --- LEFT COLUMN: CONFIGURATION --- */}
                <Card className="md:col-span-1 flex flex-col h-full border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-blue-500" />
                            Configuration
                        </CardTitle>
                        <CardDescription>Setup your bulk job</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 flex-1 overflow-hidden">
                        
                        {/* Module Name Input */}
                        <div className="space-y-2">
                            <Label>Module API Name</Label>
                            <div className="flex gap-2">
                                <Input 
                                    value={moduleName} 
                                    onChange={(e) => setModuleName(e.target.value)} 
                                    placeholder="e.g. cm_testmodule"
                                />
                                <Button size="icon" onClick={handleFetchFields} disabled={loadingFields}>
                                    {loadingFields ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>

                        {error && (
                            <Alert variant="destructive" className="py-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Fields List */}
                        <div className="flex-1 border rounded-md overflow-hidden flex flex-col">
                            <div className="bg-muted p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                                Available Fields
                            </div>
                            <ScrollArea className="flex-1 p-2">
                                {fields.length === 0 ? (
                                    <div className="text-center text-sm text-muted-foreground py-8">
                                        Click refresh to load fields
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {fields.map((field) => (
                                            <div 
                                                key={field.api_name}
                                                onClick={() => !field.is_read_only && setSelectedField(field.api_name)}
                                                className={`
                                                    p-2 rounded text-sm cursor-pointer flex items-center justify-between border
                                                    ${selectedField === field.api_name 
                                                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-300 dark:bg-blue-900/20' 
                                                        : 'hover:bg-accent border-transparent'}
                                                    ${field.is_read_only ? 'opacity-50 cursor-not-allowed' : ''}
                                                `}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{field.label}</span>
                                                    <span className="text-xs text-muted-foreground font-mono">{field.api_name}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {field.is_mandatory && <Badge variant="destructive" className="text-[10px] h-4 px-1">Req</Badge>}
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1">{field.data_type}</Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </CardContent>
                </Card>

                {/* --- RIGHT COLUMN: EXECUTION --- */}
                <Card className="md:col-span-2 flex flex-col h-full border-l-4 border-l-green-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <List className="h-5 w-5 text-green-500" />
                            Bulk Data Entry
                        </CardTitle>
                        <CardDescription>
                            Target Field: <Badge variant="secondary">{selectedField || 'None Selected'}</Badge>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 flex-1 overflow-hidden">
                        
                        <div className="space-y-2">
                            <Label>Bulk Values (One per line)</Label>
                            <Textarea 
                                className="font-mono text-sm h-[150px]" 
                                placeholder="Value 1&#10;Value 2&#10;Value 3"
                                value={bulkValues}
                                onChange={(e) => setBulkValues(e.target.value)}
                                disabled={isProcessing}
                            />
                            <div className="text-xs text-muted-foreground text-right">
                                {bulkValues.split('\n').filter(l => l.trim()).length} records to create
                            </div>
                        </div>

                        {/* Progress Bar */}
                        {isProcessing && (
                            <div className="space-y-1 animate-in fade-in">
                                <div className="flex justify-between text-sm">
                                    <span>{statusMessage}</span>
                                    <span>{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        )}

                        {/* Action Button */}
                        <Button 
                            className="w-full bg-green-600 hover:bg-green-700" 
                            onClick={handleStartBulk}
                            disabled={!selectedField || !bulkValues.trim() || isProcessing}
                        >
                            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Play className="mr-2 h-4 w-4" /> Start Bulk Creation</>}
                        </Button>

                        {/* Results Log */}
                        <div className="flex-1 border rounded-md overflow-hidden flex flex-col mt-2">
                            <div className="bg-muted p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b flex justify-between">
                                <span>Execution Log</span>
                                {results.length > 0 && <span>{results.filter(r => r.success).length} Success / {results.filter(r => !r.success).length} Failed</span>}
                            </div>
                            <ScrollArea className="flex-1 p-2 bg-slate-50 dark:bg-slate-950">
                                {results.length === 0 ? (
                                    <div className="text-center text-sm text-muted-foreground py-10 opacity-50">
                                        Results will appear here...
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {results.map((res, i) => (
                                            <div key={i} className={`text-sm p-2 rounded border flex items-start gap-2 ${res.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                                {res.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                                <div className="flex-1 grid gap-1">
                                                    <div className="font-semibold">{res.value}</div>
                                                    <div className="text-xs opacity-90 break-all">{res.message}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
};
import { RefreshCw } from 'lucide-react'; // Added missing import
export default ExpenseTest;