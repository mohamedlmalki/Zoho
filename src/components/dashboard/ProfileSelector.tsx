// --- FILE: src/components/dashboard/ProfileSelector.tsx (FIXED) ---
import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Building, AlertCircle, CheckCircle, Loader, RefreshCw, Activity, Edit, Trash2 } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile, Jobs as TicketJobs, InvoiceJobs, CatalystJobs, EmailJobs, QntrlJobs, PeopleJobs, CreatorJobs, ProjectsJobs, WebinarJobs } from '@/App'; 
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

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

type AllJobs = TicketJobs | InvoiceJobs | CatalystJobs | EmailJobs | QntrlJobs | PeopleJobs | CreatorJobs | ProjectsJobs | WebinarJobs;

// --- FIX: Added 'expense' to ServiceType ---
type ServiceType = 'desk' | 'inventory' | 'catalyst' | 'qntrl' | 'people' | 'creator' | 'projects' | 'meeting' | 'expense';

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: Profile | null;
  jobs: AllJobs;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onManualVerify: () => void;
  socket: Socket | null;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
  service?: ServiceType;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles = [], // Default to empty array to prevent crash
  selectedProfile,
  jobs,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onManualVerify,
  socket,
  onEditProfile,
  onDeleteProfile,
  service = 'desk', 
}) => {

  useEffect(() => {
    if (selectedProfile?.profileName && socket?.connected) {
      socket.emit('checkApiStatus', { 
        selectedProfileName: selectedProfile.profileName, 
        service: service 
      });
    }
  }, [selectedProfile?.profileName, socket?.connected, service, socket]);

  // --- FILTERING LOGIC ---
  const filteredProfiles = useMemo(() => {
    if (!service) return profiles; 
    return profiles.filter(p => {
      if (service === 'desk') return p.desk && p.desk.orgId;
      if (service === 'inventory') return p.inventory && p.inventory.orgId;
      if (service === 'catalyst') return p.catalyst && p.catalyst.projectId;
      if (service === 'qntrl') return p.qntrl && p.qntrl.orgId;
      if (service === 'people') return p.people && p.people.orgId;
      if (service === 'creator') return p.creator && p.creator.appName && p.creator.ownerName;
      if (service === 'projects') return p.projects && p.projects.portalId;
      if (service === 'meeting') return p.meeting && p.meeting.zsoid;
      // --- ADDED EXPENSE FILTER ---
      if (service === 'expense') return p.expense && p.expense.orgId; 
      // --- END ADDED ---
      return true; // Default show all if service not matched (or for 'desk' fallback)
    });
  }, [profiles, service]);

  const getBadgeProps = () => {
    if (!apiStatus) {
        return { text: 'Loading...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
    switch (apiStatus.status) {
      case 'success':
        return { text: 'Connected', variant: 'success' as const, icon: <CheckCircle className="h-4 w-4 mr-2" /> };
      case 'error':
        return { text: 'Connection Failed', variant: 'destructive' as const, icon: <AlertCircle className="h-4 w-4 mr-2" /> };
      default:
        return { text: 'Checking...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
  };
 
  const badgeProps = getBadgeProps();
 
  const getTotalToProcess = (job: any) => {
    return job?.totalTicketsToProcess || job?.totalToProcess || 0;
  }

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
            <div>
                <div className="flex items-center space-x-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Profiles</CardTitle>
                </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
                <Button variant="outline" size="icon" onClick={() => selectedProfile && onEditProfile(selectedProfile)} disabled={!selectedProfile}>
                    <Edit className="h-4 w-4" />
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" disabled={!selectedProfile}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the
                                <span className="font-bold"> {selectedProfile?.profileName} </span>
                                profile.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => selectedProfile && onDeleteProfile(selectedProfile.profileName)}>
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Select 
              value={selectedProfile?.profileName || ''} 
              onValueChange={onProfileChange}
              disabled={filteredProfiles.length === 0}
            >
              <SelectTrigger className="h-12 bg-muted/50 border-border hover:bg-muted transition-colors flex-1">
                <SelectValue placeholder={filteredProfiles.length === 0 ? "No profiles found" : "Select a profile..."} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-large">
                {filteredProfiles.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No profiles found for {service}.
                  </div>
                )}
                {filteredProfiles.map((profile) => {
                  const job = (jobs as any)[profile.profileName]; 
                  const isJobActive = job && job.isProcessing;
                  return (
                    <SelectItem 
                      key={profile.profileName} 
                      value={profile.profileName}
                      className="cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center space-x-3 flex-shrink min-w-0">
                          <Building className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">{profile.profileName}</span>
                        </div>
                        {isJobActive && (
                          <Badge variant="outline" className="font-mono text-xs flex-shrink-0">
                            <Activity className="h-3 w-3 mr-1.5 animate-pulse text-primary"/>
                            {job.results.length}/{getTotalToProcess(job)} {job.isPaused ? 'paused' : 'processing'}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedProfile && (
            <div className="p-4 bg-gradient-muted rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Status</span>
               
                <div className="flex items-center space-x-2">
                  <Button variant={badgeProps.variant} size="sm" onClick={onShowStatus}>
                      {badgeProps.icon}
                      {badgeProps.text}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={onManualVerify}
                    disabled={!apiStatus || apiStatus.status === 'loading'}
                  >
                      <RefreshCw className="h-4 w-4"/>
                  </Button>
                </div>
              </div>

               <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm pt-2">
                  {/* --- API STATUS INFO --- */}
                  {apiStatus && apiStatus.status === 'success' && apiStatus.fullResponse?.agentInfo && (
                      <>
                          <span className="text-muted-foreground">Name:</span>
                          <span className="font-medium text-foreground text-right truncate">
                              {apiStatus.fullResponse.agentInfo.firstName} {apiStatus.fullResponse.agentInfo.lastName}
                          </span>
                         
                          {apiStatus.fullResponse.orgName && (
                              <>
                                <span className="text-muted-foreground">Organization:</span>
                                <span className="font-medium text-foreground text-right truncate">{apiStatus.fullResponse.orgName}</span>
                              </>
                          )}
                      </>
                  )}

                  {/* --- PROFILE STATIC INFO --- */}
                  {service === 'desk' && selectedProfile.desk?.orgId && (
                    <>
                      <span className="text-muted-foreground">Desk Org ID:</span>
                      <span className="font-mono text-foreground text-right truncate">{selectedProfile.desk.orgId}</span>
                    </>
                  )}
                  {service === 'inventory' && selectedProfile.inventory?.orgId && (
                    <>
                      <span className="text-muted-foreground">Inventory Org ID:</span>
                      <span className="font-mono text-foreground text-right truncate">{selectedProfile.inventory.orgId}</span>
                    </>
                  )}
                   {service === 'expense' && selectedProfile.expense?.orgId && (
                    <>
                      <span className="text-muted-foreground">Expense Org ID:</span>
                      <span className="font-mono text-foreground text-right truncate">{selectedProfile.expense.orgId}</span>
                    </>
                  )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};