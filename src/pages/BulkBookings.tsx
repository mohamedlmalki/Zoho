// --- FILE: src/pages/BulkBookings.tsx ---

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Socket } from 'socket.io-client';
import { Profile } from '@/App';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, Settings } from 'lucide-react';

// Import Components
import { BookingForm, BookingFormData, CreateServiceData } from '@/components/dashboard/bookings/BookingForm';
import { BookingResultsDisplay, BookingResult } from '@/components/dashboard/bookings/BookingResultsDisplay';

const SERVER_URL = "http://localhost:3000";

const INITIAL_FORM: BookingFormData = {
    emails: '',
    defName: 'Bulk User',
    defPhone: '0000000000',
    serviceId: '',
    staffId: '',
    startTimeStr: new Date().toISOString().slice(0, 16),
    timeGap: 5,
    workStart: 9,
    workEnd: 17,
    delay: 0, // <--- CHANGED TO 0
    stopAfterFailures: 0
};

interface BulkBookingsProps {
    socket: Socket | null;
    profiles: Profile[]; 
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
    jobs: any;
    setJobs: any;
    createInitialJobState: any;
}

const BulkBookings: React.FC<BulkBookingsProps> = ({ 
    socket, onAddProfile, onEditProfile, onDeleteProfile, 
    jobs, setJobs, createInitialJobState 
}) => {
    const { toast } = useToast();
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [apiStatus, setApiStatus] = useState<any>(null);
    const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

    // Dropdowns
    const [services, setServices] = useState<any[]>([]);
    const [staff, setStaff] = useState<any[]>([]);

    // 1. Fetch Profiles
    const { data: profiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        },
    });

    // 2. Strict Auto-Selection
    useEffect(() => {
        if (!selectedProfileName && profiles.length > 0) {
            const bookingProfile = profiles.find(p => p.bookings && p.bookings.workspaceId);
            if (bookingProfile) setSelectedProfileName(bookingProfile.profileName);
        }
    }, [profiles, selectedProfileName]);

    const activeProfile = profiles.find(p => p.profileName === selectedProfileName) || null;
    const isProfileValid = activeProfile?.bookings?.workspaceId;

    // 3. Get Current Job
    const currentJob = selectedProfileName ? (jobs[selectedProfileName] || createInitialJobState()) : createInitialJobState();

    // 4. Socket Listeners
    useEffect(() => {
        if (!socket) return;

        const handleStatus = (data: any) => setApiStatus({ status: data.success?'success':'error', message: data.message, fullResponse: data.fullResponse });
        
        // --- SERVICES LISTENER ---
        const handleServices = (data: any) => {
            if (data.success && Array.isArray(data.data)) {
                setServices(data.data);
            } else {
                setServices([]);
            }
        };
        
        const handleStaff = (data: any) => {
            if (data.success && Array.isArray(data.data)) {
                setStaff(data.data);
            } else {
                setStaff([]);
            }
        };

        const handleDeleteResult = (data: any) => {
            if (data.success) {
                toast({ 
                    title: "Service Deleted", 
                    description: data.message,
                    className: "bg-green-50 border-green-200 text-green-800"
                });
                // Clear ID first 
                handleFormChange({ ...currentJob.formData, serviceId: '' });
                if (selectedProfileName) socket.emit('fetchBookingServices', { selectedProfileName });
            } else {
                toast({ title: "Delete Failed", description: data.error, variant: "destructive" });
            }
        };

        const handleCreateResult = (data: any) => {
            if (data.success) {
                toast({ 
                    title: "Service Created!", 
                    description: data.message,
                    className: "bg-green-50 border-green-200 text-green-800"
                });
                if (selectedProfileName) socket.emit('fetchBookingServices', { selectedProfileName });
            } else {
                toast({ title: "Creation Failed", description: data.error, variant: "destructive" });
            }
        };

        socket.on('apiStatusResult', handleStatus);
        socket.on('bookingServicesResult', handleServices);
        socket.on('bookingStaffResult', handleStaff);
        socket.on('deleteBookingServiceResult', handleDeleteResult);
        socket.on('createBookingServiceResult', handleCreateResult);

        return () => { 
            socket.off('apiStatusResult', handleStatus);
            socket.off('bookingServicesResult', handleServices);
            socket.off('bookingStaffResult', handleStaff);
            socket.off('deleteBookingServiceResult', handleDeleteResult);
            socket.off('createBookingServiceResult', handleCreateResult);
        };
    }, [socket, selectedProfileName, currentJob.formData]); 

    // 5. Fetch Data
    useEffect(() => {
        if(socket && selectedProfileName && isProfileValid) {
            socket.emit('fetchBookingServices', { selectedProfileName });
            socket.emit('fetchBookingStaff', { selectedProfileName });
        } else {
            setServices([]);
            setStaff([]);
        }
        setApiStatus(null);
    }, [selectedProfileName, isProfileValid, socket]);

    // --- FORCE AUTO-SELECT ---
    useEffect(() => {
        if (!selectedProfileName) return;

        setJobs((prev: any) => {
            const existingJob = prev[selectedProfileName];
            const job = existingJob || { ...createInitialJobState(), formData: { ...createInitialJobState().formData, ...INITIAL_FORM } };

            let updates: any = {};
            let hasChanges = false;

            // Check Services
            if (services.length > 0 && !job.formData.serviceId) {
                updates.serviceId = services[0].id;
                hasChanges = true;
            }

            // Check Staff
            if (staff.length > 0 && !job.formData.staffId) {
                updates.staffId = staff[0].id;
                hasChanges = true;
            }

            // Ensure defaults
            if (job.formData.timeGap === 30) { updates.timeGap = 5; hasChanges = true; }
            if (job.formData.delay === 1) { updates.delay = 0; hasChanges = true; } // Fix legacy state

            if (hasChanges || !existingJob) {
                return {
                    ...prev,
                    [selectedProfileName]: {
                        ...job,
                        formData: { ...job.formData, ...updates }
                    }
                };
            }
            return prev;
        });
    }, [services, staff, selectedProfileName, setJobs, createInitialJobState]); 
    // -------------------------------------------

    // 6. Handlers
    const handleManualVerify = () => {
        if (!socket || !selectedProfileName) return;
        setApiStatus({ status: 'loading', message: 'Checking connection...' });
        socket.emit('checkApiStatus', { selectedProfileName, service: 'bookings' });
    };

    const handleFormChange = (newData: BookingFormData) => {
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...currentJob, formData: newData }
        }));
    };

    const handleDeleteService = (serviceId: string) => {
        if (!socket || !selectedProfileName) return;
        toast({ title: "Deleting...", description: "Contacting Zoho..." });
        socket.emit('deleteBookingService', { serviceId, selectedProfileName });
    };

    const handleCreateService = (data: CreateServiceData) => {
        if (!socket || !selectedProfileName) return;
        toast({ title: "Creating Service...", description: "Sending data to Zoho..." });
        socket.emit('createBookingService', { ...data, selectedProfileName });
    };

    const handleStartJob = (data: BookingFormData) => {
        if (!socket || !selectedProfileName) return;
        
        const emailList = data.emails.split('\n').map(e => e.trim()).filter(e => e);
        if (emailList.length === 0) {
            toast({ title: "Validation Error", description: "No emails found.", variant: "destructive" });
            return;
        }

        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: {
                ...createInitialJobState(), 
                formData: data, 
                isProcessing: true,
                totalToProcess: emailList.length,
                processingStartTime: new Date(),
                results: []
            }
        }));

        socket.emit('startBulkBooking', {
            ...data, 
            emails: emailList,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, 
            selectedProfileName
        });
        
        toast({ title: "Job Started", description: `Scheduling ${emailList.length} appointments...` });
    };

    const handlePauseResume = () => {
        if (!socket || !selectedProfileName) return;
        const action = currentJob.isPaused ? 'resumeJob' : 'pauseJob';
        socket.emit(action, { profileName: selectedProfileName, jobType: 'bookings' });
        
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...currentJob, isPaused: !currentJob.isPaused }
        }));
    };

    const handleEndJob = () => {
        if (!socket || !selectedProfileName) return;
        socket.emit('endJob', { profileName: selectedProfileName, jobType: 'bookings' });
    };

    const handleRetryFailed = () => {
        const failedEmails = currentJob.results.filter((r: BookingResult) => !r.success).map((r: BookingResult) => r.email).join('\n');
        if (failedEmails) {
            handleFormChange({ ...currentJob.formData, emails: failedEmails });
            toast({ title: "Loaded Failures", description: "Failed emails loaded back into input." });
        }
    };

    return (
        <DashboardLayout
            service="bookings" 
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
            profiles={profiles} 
            selectedProfile={activeProfile} 
            onProfileChange={setSelectedProfileName}
            apiStatus={apiStatus || { status: 'loading', message: '' }}
            onShowStatus={() => setIsStatusDialogOpen(true)}
            onManualVerify={handleManualVerify}
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
                    <h2 className="text-3xl font-bold tracking-tight">Bulk Bookings</h2>
                    <p className="text-muted-foreground">Schedule multiple appointments in Zoho Bookings at once.</p>
                </div>

                {selectedProfileName && isProfileValid ? (
                    <div className="flex flex-col gap-6">
                        <BookingForm 
                            formData={currentJob.formData}
                            onChange={handleFormChange}
                            onSubmit={handleStartJob}
                            services={services}
                            staff={staff}
                            isProcessing={currentJob.isProcessing}
                            isPaused={currentJob.isPaused}
                            onPauseResume={handlePauseResume}
                            onEndJob={handleEndJob}
                            onClearLogs={() => setJobs((prev: any) => ({ ...prev, [selectedProfileName]: { ...currentJob, results: [] } }))}
                            onRetryFailed={handleRetryFailed}
                            failedCount={currentJob.results.filter((r: BookingResult) => !r.success).length}
                            onDeleteService={handleDeleteService}
                            onCreateService={handleCreateService} 
                        />

                        <div className="min-h-[400px]">
                            <BookingResultsDisplay 
                                results={currentJob.results} 
                                isProcessing={currentJob.isProcessing}
                                totalToProcess={currentJob.totalToProcess}
                                processingTime={currentJob.processingTime}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center bg-muted/20">
                        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No Booking Profile Configured</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mt-2 mb-6">
                            To use this tool, please select a profile that has a <strong>Zoho Bookings Workspace ID</strong> configured.
                        </p>
                        {activeProfile ? (
                            <Button onClick={() => onEditProfile(activeProfile)}>
                                <Settings className="mr-2 h-4 w-4" />
                                Configure {activeProfile.profileName}
                            </Button>
                        ) : (
                            <Button variant="secondary" disabled>
                                Select a Profile Above
                            </Button>
                        )}
                    </div>
                )}

                <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Connection Status</DialogTitle>
                            <DialogDescription>Profile: <strong>{selectedProfileName}</strong></DialogDescription>
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
            </div>
        </DashboardLayout>
    );
};

export default BulkBookings;