// --- FILE: src/components/dashboard/bookings/BookingForm.tsx ---

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Square, Trash2, RefreshCw, AlertOctagon, Clock, Settings2, ChevronDown, ChevronUp, Plus, Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface BookingFormData {
    emails: string;
    defName: string;
    defPhone: string;
    serviceId: string;
    staffId: string;
    startTimeStr: string; 
    timeGap: number; 
    workStart: number; 
    workEnd: number;
    delay: number;
    stopAfterFailures: number;
}

// Data needed for creating a service
export interface CreateServiceData {
    name: string;
    type: 'oneonone' | 'group' | 'resource';
    duration: number;
    cost: number;
    description: string;
    assignedStaff: string[];
}

interface BookingFormProps {
    formData: BookingFormData;
    onChange: (data: BookingFormData) => void;
    onSubmit: (data: BookingFormData) => void;
    services: any[];
    staff: any[];
    isProcessing: boolean;
    isPaused?: boolean;
    onPauseResume?: () => void;
    onEndJob?: () => void;
    onClearLogs?: () => void;
    onRetryFailed?: () => void;
    failedCount?: number;
    onDeleteService: (serviceId: string) => void;
    onCreateService: (data: CreateServiceData) => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
    formData, onChange, onSubmit, services, staff,
    isProcessing, isPaused, onPauseResume, onEndJob, onClearLogs, onRetryFailed, failedCount,
    onDeleteService, onCreateService
}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    
    // Create Service Form State
    const [newService, setNewService] = useState<CreateServiceData>({
        name: '',
        type: 'oneonone',
        duration: 30,
        cost: 0,
        description: '',
        assignedStaff: [] // IDs
    });

    const handleChange = (field: keyof BookingFormData, value: any) => {
        onChange({ ...formData, [field]: value });
    };

    const handleCreateChange = (field: keyof CreateServiceData, value: any) => {
        setNewService(prev => ({ ...prev, [field]: value }));
    };

    const toggleStaffSelection = (staffId: string) => {
        setNewService(prev => {
            const current = prev.assignedStaff;
            if (current.includes(staffId)) {
                return { ...prev, assignedStaff: current.filter(id => id !== staffId) };
            } else {
                return { ...prev, assignedStaff: [...current, staffId] };
            }
        });
    };

    const submitCreateService = () => {
        onCreateService(newService);
        setIsCreateOpen(false);
        // Reset form slightly but keep staff for convenience
        setNewService(prev => ({ ...prev, name: '', description: '' })); 
    };

    const selectedServiceName = services.find(s => s.id === formData.serviceId)?.name || "Selected Service";

    return (
        <Card className="shadow-medium h-full">
            <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Setup your bulk booking campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                
                {/* 1. SERVICE, STAFF & DEFAULT NAME (SIDE BY SIDE) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Service Selection */}
                    <div className="space-y-2">
                        <Label>Service</Label>
                        <div className="flex gap-2">
                            <Select 
                                value={formData.serviceId} 
                                onValueChange={(v) => handleChange('serviceId', v)}
                                disabled={isProcessing}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={services.length ? "Select Service" : "Loading Services..."} />
                                </SelectTrigger>
                                <SelectContent>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration}m)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Create Service Button */}
                            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="icon" title="Create New Service" disabled={isProcessing}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Create New Service</DialogTitle>
                                        <DialogDescription>Add a service to your Zoho Bookings workspace.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Service Name</Label>
                                            <Input value={newService.name} onChange={e => handleCreateChange('name', e.target.value)} placeholder="e.g. Consultation" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Type</Label>
                                                <Select value={newService.type} onValueChange={(v: any) => handleCreateChange('type', v)}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="oneonone">One on One</SelectItem>
                                                        <SelectItem value="group">Group Booking</SelectItem>
                                                        <SelectItem value="resource">Resource</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Duration (min)</Label>
                                                <Input type="number" min="5" value={newService.duration} onChange={e => handleCreateChange('duration', parseInt(e.target.value))} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Price (Optional)</Label>
                                            <Input type="number" min="0" value={newService.cost} onChange={e => handleCreateChange('cost', parseInt(e.target.value))} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Assign Staff</Label>
                                            <ScrollArea className="h-[120px] w-full rounded-md border p-2">
                                                {staff.length > 0 ? staff.map(s => (
                                                    <div key={s.id} className="flex items-center space-x-2 py-1">
                                                        <Checkbox 
                                                            id={`staff-${s.id}`} 
                                                            checked={newService.assignedStaff.includes(s.id)}
                                                            onCheckedChange={() => toggleStaffSelection(s.id)}
                                                        />
                                                        <label htmlFor={`staff-${s.id}`} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                                                            {s.name}
                                                        </label>
                                                    </div>
                                                )) : <div className="text-xs text-muted-foreground">No staff loaded.</div>}
                                            </ScrollArea>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" onClick={submitCreateService} disabled={!newService.name}>Create Service</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {/* Delete Service Button */}
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="icon" disabled={isProcessing || !formData.serviceId} title="Delete Selected">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Permanently delete <strong>{selectedServiceName}</strong>?
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => onDeleteService(formData.serviceId)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    {/* Staff Selection */}
                    <div className="space-y-2">
                        <Label>Staff</Label>
                        <Select 
                            value={formData.staffId} 
                            onValueChange={(v) => handleChange('staffId', v)}
                            disabled={isProcessing || staff.length === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={staff.length ? "Select Staff" : "Loading Staff..."} />
                            </SelectTrigger>
                            <SelectContent>
                                {staff.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Default Name (Keep here, Side by Side) */}
                    <div className="space-y-2">
                        <Label>Default Name</Label>
                        <Input value={formData.defName} onChange={(e) => handleChange('defName', e.target.value)} disabled={isProcessing}/>
                    </div>
                </div>

                {/* 2. EMAILS INPUT */}
                <div className="space-y-2">
                    <Label>Emails List (One per line)</Label>
                    <Textarea 
                        placeholder="client1@example.com&#10;client2@example.com" 
                        className="min-h-[120px] font-mono text-sm"
                        value={formData.emails}
                        onChange={(e) => handleChange('emails', e.target.value)}
                        disabled={isProcessing}
                    />
                    <div className="text-xs text-muted-foreground text-right">
                        {formData.emails.split('\n').filter(l => l.trim()).length} emails detected
                    </div>
                </div>

                {/* 3. ADVANCED SETTINGS */}
                <div>
                    <Button 
                        variant="ghost" size="sm" 
                        className="w-full flex items-center justify-between border border-dashed text-muted-foreground hover:text-primary hover:border-primary/50"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Advanced Settings</span>
                        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>

                {showAdvanced && (
                    <div className="space-y-4 p-4 border rounded-md bg-muted/20 animate-in slide-in-from-top-2 duration-200">
                        {/* Default Phone (Moved Back Here) */}
                        <div className="space-y-2">
                            <Label>Default Phone</Label>
                            <Input value={formData.defPhone} onChange={(e) => handleChange('defPhone', e.target.value)} disabled={isProcessing}/>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date & Time</Label>
                                <Input type="datetime-local" value={formData.startTimeStr} onChange={(e) => handleChange('startTimeStr', e.target.value)} disabled={isProcessing}/>
                            </div>
                            <div className="space-y-2">
                                <Label>Time Gap (Minutes)</Label>
                                <Input type="number" min="0" value={formData.timeGap} onChange={(e) => handleChange('timeGap', parseInt(e.target.value))} disabled={isProcessing}/>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 bg-background p-3 rounded-md border border-border/50">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-muted-foreground">Work Start (24h)</Label>
                                <Input type="number" min="0" max="23" value={formData.workStart} onChange={(e) => handleChange('workStart', parseInt(e.target.value))} disabled={isProcessing}/>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase text-muted-foreground">Work End (24h)</Label>
                                <Input type="number" min="0" max="23" value={formData.workEnd} onChange={(e) => handleChange('workEnd', parseInt(e.target.value))} disabled={isProcessing}/>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. EXECUTION CONTROLS */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 whitespace-nowrap"><Clock className="h-3 w-3"/> Delay (sec)</Label>
                        <Input type="number" min="1" value={formData.delay} onChange={(e) => handleChange('delay', parseInt(e.target.value))} disabled={isProcessing} />
                    </div>
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2 whitespace-nowrap"><AlertOctagon className="h-3 w-3"/> Stop Fail</Label>
                        <Input type="number" min="0" value={formData.stopAfterFailures} onChange={(e) => handleChange('stopAfterFailures', parseInt(e.target.value))} disabled={isProcessing} placeholder="0 = Never" />
                    </div>
                </div>

            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
                {!isProcessing ? (
                    <Button className="w-full" size="lg" onClick={() => onSubmit(formData)}>
                        <Play className="mr-2 h-4 w-4" /> Start Bulk Booking
                    </Button>
                ) : (
                    <div className="flex gap-2 w-full">
                         <Button variant={isPaused ? "default" : "secondary"} className="flex-1" onClick={onPauseResume}>
                            {isPaused ? <Play className="mr-2 h-4 w-4"/> : <Pause className="mr-2 h-4 w-4"/>}
                            {isPaused ? "Resume Job" : "Pause Job"}
                        </Button>
                        <Button variant="destructive" onClick={onEndJob}>
                            <Square className="mr-2 h-4 w-4 fill-current" /> Stop
                        </Button>
                    </div>
                )}

                <div className="flex gap-2 w-full">
                    {failedCount && failedCount > 0 && !isProcessing ? (
                        <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50" onClick={onRetryFailed}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Retry {failedCount} Failed
                        </Button>
                    ) : null}
                    <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClearLogs} disabled={isProcessing}>
                        <Trash2 className="mr-2 h-4 w-4" /> Clear Logs
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
};