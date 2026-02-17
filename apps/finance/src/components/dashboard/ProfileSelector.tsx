import React, { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Building, AlertCircle, CheckCircle, Loader, RefreshCw, Activity, Edit, Trash2, PauseCircle, CheckCircle2, StopCircle, XCircle } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile, InvoiceJobs, CustomModuleJobs, ExpenseJobs } from '@/App'; 
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

// Simplified Type for compatibility
type AllJobs = InvoiceJobs | CustomModuleJobs | ExpenseJobs | any;

type ServiceType = 'inventory' | 'expense' | 'books' | 'billing';

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
  onAddProfile?: () => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  jobs,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onManualVerify,
  socket,
  onEditProfile,
  onDeleteProfile,
  service = 'inventory', 
}) => {

  useEffect(() => {
    if (selectedProfile?.profileName && socket?.connected) {
        socket.emit('checkApiStatus', { 
            selectedProfileName: selectedProfile.profileName, 
            service: service 
        });
    }
  }, [selectedProfile?.profileName, socket?.connected, service, socket, selectedProfile]);

  const filteredProfiles = useMemo(() => {
    if (!profiles || profiles.length === 0) return [];
    
    return profiles.filter(p => {
      if (!service) return true;
      if (service === 'inventory') return p.inventory && p.inventory.orgId;
      if (service === 'books') return p.books && p.books.orgId;
      if (service === 'billing') return p.billing && p.billing.orgId;
      if (service === 'expense') return p.expense && p.expense.orgId;
      return true;
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
                <SelectValue placeholder={filteredProfiles.length > 0 ? "Select a profile..." : "No profiles found"} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-large">
                {filteredProfiles.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No Profiles found.<br/>
                    <span className="text-xs">Add Account in Dashboard.</span>
                  </div>
                )}
                {filteredProfiles.map((profile) => {
                  const job = jobs ? (jobs as any)[profile.profileName] : null;
                  
                  const total = getTotalToProcess(job);
                  const current = job?.results?.length || 0;
                  
                  // --- FIX IS HERE: Only count as failed if stage is 'complete' AND success is false ---
                  const failedCount = job?.results?.filter((r: any) => r.success === false && r.stage === 'complete').length || 0;

                  let status: 'processing' | 'paused' | 'finished' | 'ended' | null = null;
                  
                  if (job) {
                    if (job.isProcessing) {
                       status = job.isPaused ? 'paused' : 'processing';
                    } else if (job.isComplete) {
                       status = (current >= total && total > 0) ? 'finished' : 'ended';
                    }
                  }

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
                        
                        <div className="flex items-center space-x-2">
                            {failedCount > 0 && (
                                <Badge 
                                    variant="destructive" 
                                    className="font-mono text-xs flex-shrink-0 gap-1 border-red-600 bg-red-100 text-red-700 hover:bg-red-100"
                                >
                                    <XCircle className="h-3 w-3" />
                                    <span>{failedCount} Fail</span>
                                </Badge>
                            )}
                            {status && (
                            <Badge 
                                variant="outline" 
                                className={`font-mono text-xs flex-shrink-0 gap-1 ${
                                    status === 'processing' ? 'border-primary text-primary' :
                                    status === 'paused' ? 'border-yellow-500 text-yellow-500' :
                                    status === 'finished' ? 'border-green-500 text-green-500' :
                                    'border-red-500 text-red-500' 
                                }`}
                            >
                                {status === 'processing' && <Activity className="h-3 w-3 animate-pulse"/>}
                                {status === 'paused' && <PauseCircle className="h-3 w-3"/>}
                                {status === 'finished' && <CheckCircle2 className="h-3 w-3"/>}
                                {status === 'ended' && <StopCircle className="h-3 w-3"/>}
                                
                                <span>{current}/{total}</span>
                                <span className="capitalize hidden sm:inline">{status}</span>
                            </Badge>
                            )}
                        </div>
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
                <span className="text-sm font-medium text-foreground"></span>
               
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
                  {apiStatus && apiStatus.status === 'success' && apiStatus.fullResponse && (
                      <>
                          {apiStatus.fullResponse.orgName && (
                            <>
                                <span className="text-muted-foreground">Organization:</span>
                                <span className="font-medium text-foreground text-right truncate">
                                    {apiStatus.fullResponse.orgName}
                                </span>
                            </>
                          )}

                          {apiStatus.fullResponse.agentInfo && (
                            <>
                                <span className="text-muted-foreground">Agent:</span>
                                <span className="font-medium text-foreground text-right truncate">
                                    {apiStatus.fullResponse.agentInfo.firstName} {apiStatus.fullResponse.agentInfo.lastName}
                                </span>
                            </>
                          )}
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