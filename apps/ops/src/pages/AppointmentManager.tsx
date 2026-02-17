// --- FILE: src/pages/AppointmentManager.tsx ---

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Socket } from 'socket.io-client';
import { Profile } from '@/App';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from "@tanstack/react-query";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from "@/components/ui/progress"; 
import { 
    Calendar, Clock, User, Mail, Ban, CheckCircle2, UserX, Search, RefreshCw, Layers,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Trash2, CheckSquare, Square
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SERVER_URL = "http://localhost:3000";

interface AppointmentManagerProps {
    socket: Socket | null;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
    jobs: any; 
}

const AppointmentManager: React.FC<AppointmentManagerProps> = ({ 
    socket, onAddProfile, onEditProfile, onDeleteProfile, jobs 
}) => {
    const { toast } = useToast();
    const [selectedProfileName, setSelectedProfileName] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    // --- BULK UPDATE STATE ---
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(0);
    const [bulkStats, setBulkStats] = useState({ processed: 0, total: 0 });

    const [appointments, setAppointments] = useState<any[]>([]);
    
    // --- PAGINATION STATE ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100; 

    // --- SELECTION STATE ---
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // --- SERVICE STATE ---
    const [services, setServices] = useState<any[]>([]);
    const [serviceFilter, setServiceFilter] = useState('all');
    const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceCost, setNewServiceCost] = useState('0');
    const [newServiceDuration, setNewServiceDuration] = useState('30');

    // Filters
    const [dateFrom, setDateFrom] = useState('2025-01-01'); 
    const [dateTo, setDateTo] = useState('2027-12-31');     
    const [statusFilter, setStatusFilter] = useState('all');

    const { data: profiles = [] } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error('Could not connect to the server.');
            return response.json();
        },
        refetchOnWindowFocus: false,
    });
    
    useEffect(() => {
        if (!selectedProfileName && profiles.length > 0) {
            const bookingProfile = profiles.find(p => p.bookings && p.bookings.workspaceId);
            if (bookingProfile) setSelectedProfileName(bookingProfile.profileName);
            else if (profiles[0]) setSelectedProfileName(profiles[0].profileName);
        }
    }, [profiles, selectedProfileName]);

    const activeProfile = profiles.find(p => p.profileName === selectedProfileName) || null;
    const isProfileValid = activeProfile?.bookings?.workspaceId;

    useEffect(() => {
        if (!socket) return;

        // --- LISTENERS ---

        const handleFetchResult = (data: any) => {
            setIsLoading(false);
            if (data.success) {
                const safeAppointments = Array.isArray(data.data) ? data.data : [];
                setAppointments(safeAppointments);
                setCurrentPage(1); 
                setSelectedIds([]); 
                toast({ title: "Updated", description: `Loaded ${safeAppointments.length} appointments.` });
            } else {
                setAppointments([]);
                toast({ title: "Error", description: data.error, variant: "destructive" });
            }
        };

        const handleServicesResult = (data: any) => {
            if (data.success) {
                setServices(data.data || []);
            }
        };

        const handleCreateServiceResult = (data: any) => {
            if (data.success) {
                toast({ title: "Service Created", description: data.message });
                setIsAddServiceOpen(false);
                setNewServiceName('');
                fetchServices(); 
            } else {
                toast({ title: "Creation Failed", description: data.error, variant: "destructive" });
            }
        };

        const handleDeleteServiceResult = (data: any) => {
            if (data.success) {
                toast({ title: "Service Deleted", description: data.message });
                setServiceFilter('all');
                fetchServices();
            } else {
                toast({ title: "Delete Failed", description: data.error, variant: "destructive" });
            }
        };

        const handleUpdateResult = (data: any) => {
            if (data.success) {
                toast({ title: "Success", description: data.message, className: "bg-green-50 text-green-800 border-green-200" });
                // We do NOT fetch appointments here automatically if bulk update is running to avoid refreshing the list mid-process
                // But since we can't easily access current 'isBulkUpdating' inside this effect without adding it to deps (bad),
                // we'll skip auto-refresh on single update for now or trust the user to manual refresh.
                // Or better:
                // fetchAppointments(); 
            } else {
                toast({ title: "Update Failed", description: data.error, variant: "destructive" });
            }
        };

        const handleBulkProgress = (data: any) => {
            setIsBulkUpdating(true); // Force it visible
            setBulkProgress(data.progress);
            setBulkStats({ processed: data.processed, total: data.total });
        };

        const handleBulkResult = (data: any) => {
            setIsBulkUpdating(false);
            setBulkProgress(100);
            if (data.success) {
                toast({ title: "Bulk Operation Complete", description: data.message, className: "bg-green-50 text-green-800 border-green-200" });
                setSelectedIds([]); 

                // --- OPTIMISTIC UI UPDATE (SPEED BOOST) ---
                if (data.successfulIds && data.action) {
                    // Normalize Status Strings
                    const newStatus = data.action === 'cancel' ? 'cancelled' : 
                                      data.action === 'noshow' ? 'no_show' : 
                                      'completed';

                    setAppointments(prev => prev.map(a => 
                        data.successfulIds.includes(a.booking_id) ? { ...a, status: newStatus } : a
                    ));
                } else {
                    // Legacy Fallback if backend doesn't return IDs
                    fetchAppointments(); 
                }
            } else {
                toast({ title: "Bulk Operation Failed", description: data.error, variant: "destructive" });
            }
        };

        socket.on('fetchAppointmentsResult', handleFetchResult);
        socket.on('bookingServicesResult', handleServicesResult);
        socket.on('createBookingServiceResult', handleCreateServiceResult);
        socket.on('deleteBookingServiceResult', handleDeleteServiceResult);
        socket.on('updateAppointmentResult', handleUpdateResult);
        socket.on('bulkUpdateProgress', handleBulkProgress);
        socket.on('bulkUpdateAppointmentResult', handleBulkResult);

        return () => {
            socket.off('fetchAppointmentsResult', handleFetchResult);
            socket.off('bookingServicesResult', handleServicesResult);
            socket.off('createBookingServiceResult', handleCreateServiceResult);
            socket.off('deleteBookingServiceResult', handleDeleteServiceResult);
            socket.off('updateAppointmentResult', handleUpdateResult);
            socket.off('bulkUpdateProgress', handleBulkProgress);
            socket.off('bulkUpdateAppointmentResult', handleBulkResult);
        };
        // REMOVED isBulkUpdating to prevent listener churn
    }, [socket, selectedProfileName, toast]); 

    // --- ACTION FUNCTIONS ---

    const fetchAppointments = () => {
        if (!socket || !selectedProfileName) return;
        setIsLoading(true);
        socket.emit('fetchAppointments', {
            selectedProfileName,
            fromDate: dateFrom,
            toDate: dateTo,
            status: statusFilter,
            serviceId: serviceFilter // Pass service filter
        });
    };

    const fetchServices = () => {
        if (!socket || !selectedProfileName) return;
        socket.emit('fetchBookingServices', { selectedProfileName });
    };

    // Load services when profile changes
    useEffect(() => {
        if (selectedProfileName && isProfileValid) {
            fetchServices();
        }
    }, [selectedProfileName, isProfileValid]);

    const handleCreateService = () => {
        if (!newServiceName) return;
        socket?.emit('createBookingService', {
            selectedProfileName,
            name: newServiceName,
            cost: newServiceCost,
            duration: newServiceDuration
        });
    };

    const handleDeleteService = () => {
        if (serviceFilter === 'all') return;
        if (!confirm("Are you sure you want to delete this service? This action cannot be undone.")) return;
        socket?.emit('deleteBookingService', {
            selectedProfileName,
            serviceId: serviceFilter
        });
    };

    const updateStatus = (bookingId: string, action: 'cancel' | 'noshow' | 'completed') => {
        if (!socket || !selectedProfileName) return;
        if (!confirm(`Are you sure you want to mark this as ${action.toUpperCase()}?`)) return;
        socket.emit('updateAppointmentStatus', { selectedProfileName, bookingId, action });
    };

    const handleBulkAction = (action: 'cancel' | 'noshow' | 'completed') => {
        if (!socket || !selectedProfileName) return;
        if (selectedIds.length === 0) return;
        if (!confirm(`Are you sure you want to mark ${selectedIds.length} appointments as ${action.toUpperCase()}?`)) return;

        // Initialize state
        setIsBulkUpdating(true);
        setBulkProgress(0);
        setBulkStats({ processed: 0, total: selectedIds.length });
        
        socket.emit('bulkUpdateAppointmentStatus', {
            selectedProfileName,
            bookingIds: selectedIds,
            action
        });
    };

    // --- PAGINATION & SELECTION ---
    const totalPages = Math.ceil(appointments.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentAppointments = appointments.slice(startIndex, endIndex);

    const isPageSelected = currentAppointments.length > 0 && currentAppointments.every(a => selectedIds.includes(a.booking_id));

    const toggleSelectPage = (checked: boolean) => {
        if (checked) {
            const newIds = currentAppointments.map(a => a.booking_id);
            const uniqueIds = Array.from(new Set([...selectedIds, ...newIds]));
            setSelectedIds(uniqueIds);
        } else {
            const pageIds = currentAppointments.map(a => a.booking_id);
            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
        }
    };

    const toggleSelectOne = (id: string, checked: boolean) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(x => x !== id));
    };
    
    // --- GLOBAL SELECT ALL ---
    const handleSelectAll = () => {
        if (appointments.length === 0) return;
        const allIds = appointments.map(a => a.booking_id);
        setSelectedIds(allIds);
        toast({ title: "Selected All", description: `${allIds.length} appointments selected across all pages.` });
    };

    const handleDeselectAll = () => {
        setSelectedIds([]);
        toast({ title: "Selection Cleared", description: "All appointments deselected." });
    };

    const getStatusBadge = (status: string) => {
        const s = status ? status.toLowerCase() : 'unknown';
        if (s === 'upcoming') return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Upcoming</Badge>;
        if (s === 'completed') return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
        if (s === 'cancel' || s === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
        if (s === 'no_show') return <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">No Show</Badge>;
        return <Badge variant="outline">{status}</Badge>;
    };

    // --- PAGINATION CONTROLS COMPONENT ---
    const PaginationControls = () => {
        if (totalPages <= 1) return null;
        return (
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className={currentPage === 1 ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} />
                    </PaginationItem>
                    <PaginationItem><span className="px-4 text-sm font-medium">Page {currentPage} of {totalPages}</span></PaginationItem>
                    <PaginationItem>
                        <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className={currentPage === totalPages ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} />
                    </PaginationItem>
                    <PaginationItem>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        );
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
            socket={socket}
            jobs={jobs}
            apiStatus={{ status: 'success', message: 'Connected' }} 
            onShowStatus={() => {}}
            onManualVerify={() => {}}
        >
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Appointments</h2>
                        <p className="text-muted-foreground">Manage your Zoho Bookings schedule.</p>
                    </div>
                    <Button onClick={fetchAppointments} disabled={isLoading || !isProfileValid}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh List
                    </Button>
                </div>

                {selectedProfileName && isProfileValid ? (
                    <div className="flex flex-col gap-6">
                        
                        {/* --- PROGRESS BAR FOR BULK JOB --- */}
                        {isBulkUpdating && (
                            <Card className="border-blue-200 bg-blue-50">
                                <CardContent className="p-4">
                                    <div className="flex justify-between mb-2 text-sm font-medium text-blue-800">
                                        <span>Bulk Processing...</span>
                                        <span>{bulkStats.processed} / {bulkStats.total}</span>
                                    </div>
                                    <Progress value={bulkProgress} className="h-2" />
                                </CardContent>
                            </Card>
                        )}

                        {/* --- FILTERS & SERVICE MANAGEMENT --- */}
                        <Card>
                            <CardContent className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                                    <div className="space-y-2">
                                        <Label>From</Label>
                                        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>To</Label>
                                        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                                            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="upcoming">Upcoming</SelectItem>
                                                <SelectItem value="completed">Completed</SelectItem>
                                                <SelectItem value="cancel">Cancelled</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {/* --- SERVICE DROPDOWN WITH ADD/DELETE --- */}
                                    <div className="space-y-2">
                                        <Label className="flex justify-between">
                                            Service
                                            {serviceFilter !== 'all' && (
                                                <span onClick={handleDeleteService} className="text-xs text-red-500 cursor-pointer hover:underline flex items-center gap-1">
                                                    <Trash2 className="h-3 w-3" /> Delete
                                                </span>
                                            )}
                                        </Label>
                                        <div className="flex gap-2">
                                            <Select value={serviceFilter} onValueChange={setServiceFilter}>
                                                <SelectTrigger className="flex-1"><SelectValue placeholder="All Services" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All Services</SelectItem>
                                                    {services.map((s: any) => (
                                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            
                                            {/* ADD SERVICE DIALOG */}
                                            <Dialog open={isAddServiceOpen} onOpenChange={setIsAddServiceOpen}>
                                                <DialogTrigger asChild>
                                                    <Button size="icon" variant="outline"><Plus className="h-4 w-4" /></Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogHeader>
                                                        <DialogTitle>Add New Service</DialogTitle>
                                                        <DialogDescription>Create a new service in Zoho Bookings.</DialogDescription>
                                                    </DialogHeader>
                                                    <div className="space-y-4 py-4">
                                                        <div className="space-y-2">
                                                            <Label>Service Name</Label>
                                                            <Input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="e.g. Consultation" />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label>Duration (mins)</Label>
                                                                <Input type="number" value={newServiceDuration} onChange={e => setNewServiceDuration(e.target.value)} />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label>Cost</Label>
                                                                <Input type="number" value={newServiceCost} onChange={e => setNewServiceCost(e.target.value)} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <DialogFooter>
                                                        <Button onClick={handleCreateService}>Create Service</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>

                                    <Button onClick={fetchAppointments} variant="secondary" disabled={isLoading}>
                                        <Search className="mr-2 h-4 w-4" /> Filter
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* --- BULK ACTIONS TOOLBAR --- */}
                        {selectedIds.length > 0 && (
                            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md animate-in fade-in slide-in-from-top-2">
                                <Layers className="h-4 w-4 text-blue-600 ml-2" />
                                <span className="text-sm font-medium text-blue-700 mr-2">{selectedIds.length} Selected</span>
                                <div className="h-4 w-px bg-blue-200 mx-2"></div>
                                <Button size="sm" variant="outline" className="bg-white hover:bg-green-50 text-green-700" onClick={() => handleBulkAction('completed')} disabled={isBulkUpdating}>
                                    Mark Completed
                                </Button>
                                <Button size="sm" variant="outline" className="bg-white hover:bg-orange-50 text-orange-700" onClick={() => handleBulkAction('noshow')} disabled={isBulkUpdating}>
                                    Mark No Show
                                </Button>
                                <Button size="sm" variant="outline" className="bg-white hover:bg-red-50 text-red-700" onClick={() => handleBulkAction('cancel')} disabled={isBulkUpdating}>
                                    Cancel
                                </Button>
                            </div>
                        )}

                        {/* --- RESULTS TABLE --- */}
                        <Card className="shadow-sm">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <CardTitle className="text-lg">Results ({appointments.length})</CardTitle>
                                    
                                    {/* --- SELECT ALL BUTTON --- */}
                                    {appointments.length > 0 && (
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={selectedIds.length === appointments.length ? handleDeselectAll : handleSelectAll}
                                            className="h-8 gap-2"
                                        >
                                            {selectedIds.length === appointments.length ? (
                                                <Square className="h-3 w-3" />
                                            ) : (
                                                <CheckSquare className="h-3 w-3" />
                                            )}
                                            {selectedIds.length === appointments.length ? "Deselect All" : "Select All"}
                                        </Button>
                                    )}
                                </div>

                                {appointments.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                )}
                            </CardHeader>
                            <CardContent>
                                {/* --- TOP PAGINATION --- */}
                                <div className="mb-4 flex justify-end">
                                    <PaginationControls />
                                </div>

                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">
                                                    <Checkbox checked={isPageSelected} onCheckedChange={(checked) => toggleSelectPage(!!checked)} />
                                                </TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead>Service / Staff</TableHead>
                                                <TableHead>Time</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.isArray(currentAppointments) && currentAppointments.length > 0 ? (
                                                currentAppointments.map((apt: any) => (
                                                    <TableRow key={apt.booking_id} className={selectedIds.includes(apt.booking_id) ? "bg-muted/50" : ""}>
                                                        <TableCell>
                                                            <Checkbox checked={selectedIds.includes(apt.booking_id)} onCheckedChange={(checked) => toggleSelectOne(apt.booking_id, !!checked)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium flex items-center gap-2">
                                                                <User className="h-3 w-3 text-muted-foreground"/> {apt.customer_name}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                                                                <Mail className="h-3 w-3"/> {apt.customer_email}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{apt.service_name}</div>
                                                            <div className="text-xs text-muted-foreground">{apt.staff_name}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <Calendar className="h-3 w-3 text-muted-foreground"/> {apt.start_time?.split(' ')[0]}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                                <Clock className="h-3 w-3"/> {apt.start_time?.split(' ')[1]}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{getStatusBadge(apt.status)}</TableCell>
                                                        <TableCell className="text-right space-x-1">
                                                            {apt.status && apt.status.toLowerCase() === 'upcoming' && (
                                                                <>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => updateStatus(apt.booking_id, 'completed')}>
                                                                        <CheckCircle2 className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => updateStatus(apt.booking_id, 'cancel')}>
                                                                        <Ban className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                        No appointments found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* --- BOTTOM PAGINATION --- */}
                                <div className="mt-4">
                                    <PaginationControls />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 text-center bg-muted/20">
                        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">{profiles.length === 0 ? "Loading..." : "No Profile"}</h3>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};

export default AppointmentManager;