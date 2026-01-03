// --- FILE: src/components/dashboard/projects/ProjectsTasksDashboard.tsx ---
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Profile } from '@/App';
import { ProjectsJobs, ProjectsJobState, ZohoProject, ZohoTask } from './ProjectsDataTypes';
import { TaskBulkForm } from './TaskBulkForm'; 
import { TaskResultsDisplay } from './TaskResultsDisplay';
import { TaskProgressTable } from './TaskProgressTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

interface ProjectsTasksDashboardProps {
    jobs: ProjectsJobs;
    setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
    socket: Socket | null;
    createInitialJobState: () => ProjectsJobState;
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
    onDeleteProfile: (profileName: string) => void;
    title: string;
    jobType: 'projects';
    description: string;
}

const SERVER_URL = "http://localhost:3000";

export const ProjectsTasksDashboard: React.FC<ProjectsTasksDashboardProps> = ({ 
    socket, 
    onAddProfile, 
    onEditProfile, 
    onDeleteProfile,
    jobs,
    setJobs,
    createInitialJobState,
    title,
    jobType,
    description,
}) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  
  const [projects, setProjects] = useState<ZohoProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ZohoTask[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [autoTaskListId, setAutoTaskListId] = useState<string | null>(null);

  const [currentProjectName, setCurrentProjectName] = useState<string>('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      return response.ok ? response.json() : [];
    },
    refetchOnWindowFocus: false,
  });
  
  const projectsProfiles = useMemo(() => {
    return profiles.filter(p => p.projects?.portalId);
  }, [profiles]);

  useEffect(() => {
    if (projectsProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(projectsProfiles[0].profileName);
    }
  }, [projectsProfiles, activeProfileName]);
  
  const selectedProfile = projectsProfiles.find(p => p.profileName === activeProfileName) || null;
  const jobState = jobs[activeProfileName || ''] || createInitialJobState();

  const handleFetchProjects = useCallback(() => {
      if (socket && activeProfileName && selectedProfile) {
        setIsDataLoading(true);
        socket.emit('getProjectsProjects', { selectedProfileName: activeProfileName });
    }
  }, [socket, activeProfileName, selectedProfile]);

  useEffect(() => {
    handleFetchProjects();
  }, [handleFetchProjects]);

  const handleUpdateProjectName = useCallback(() => {
      if (!socket || !activeProfileName || !selectedProfile || !selectedProjectId || !currentProjectName) {
          toast({ title: "Error", description: "Cannot update, missing data.", variant: "destructive" });
          return;
      }
      setIsUpdatingName(true);
      
      const eventData = { 
          selectedProfileName: activeProfileName, 
          portalId: selectedProfile.projects?.portalId,
          projectId: selectedProjectId,
          payload: {
              name: currentProjectName 
          }
      };

      socket.emit('updateProjectDetails', eventData); 

  }, [socket, activeProfileName, selectedProfile, selectedProjectId, currentProjectName, toast]); 


  useEffect(() => {
    if (!socket) return;

    const handleApiStatus = (result: { success: boolean, message: string, fullResponse?: any }) => {
        setApiStatus({
            status: result.success ? 'success' : 'error',
            message: result.message,
            fullResponse: result.fullResponse || null
        });
    };
    
    const handleProjectsResult = (result: { success: boolean, data: ZohoProject[], error?: string }) => {
        setIsDataLoading(false);
        if (result.success) {
            setProjects(result.data);
            if (result.data.length > 0) {
                if (!selectedProjectId || !result.data.find(p => p.id === selectedProjectId)) {
                   setSelectedProjectId(result.data[0].id);
                }
            } else {
                setSelectedProjectId(null);
            }
            toast({ title: "Projects Loaded", description: `${result.data.length} projects found.` });
        } else {
            setProjects([]);
            setSelectedProjectId(null);
            toast({ title: "Error Fetching Projects", description: result.error, variant: 'destructive' });
        }
    };
    
    const handleTasksResult = (result: { success: boolean, data: ZohoTask[], error?: string }) => {
        setIsDataLoading(false);
        if (result.success) {
            setTasks(result.data);
            
            if (result.data.length > 0) {
                const firstTask = result.data[0];
                if (firstTask.tasklist && firstTask.tasklist.id) {
                    setAutoTaskListId(firstTask.tasklist.id);
                }
            } else {
                setAutoTaskListId(null); 
            }

        } else {
            setTasks([]);
            setAutoTaskListId(null);
            toast({ title: "Error Fetching Tasks", description: result.error, variant: 'destructive' });
        }
    };

    const handleUpdateProjectResult = (result: { success: boolean, data: ZohoProject, error?: string }) => {
        setIsUpdatingName(false);
        if (result.success) {
            setCurrentProjectName(result.data.name);
            toast({ title: "Project Name Updated!", description: `Set to ${result.data.name}` });
            handleFetchProjects();
        } else {
            toast({ title: "Error Updating Project", description: result.error, variant: "destructive" });
        }
    };
    
    const handleUpdateProjectError = (e: { error: string }) => { 
        setIsUpdatingName(false);
        toast({ title: "Error Updating Project", description: e.error, variant: "destructive" });
    };
    
    const handleBulkError = (e: { message: string }) => {
        if (isUpdatingName) {
            setIsUpdatingName(false);
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    socket.on('apiStatusResult', handleApiStatus);
    socket.on('projectsProjectsResult', handleProjectsResult); 
    socket.on('projectsTasksResult', handleTasksResult);       
    socket.on('projectsUpdateProjectResult', handleUpdateProjectResult);
    socket.on('projectsUpdateProjectError', handleUpdateProjectError);
    socket.on('bulkError', handleBulkError);

    return () => {
      socket.off('apiStatusResult', handleApiStatus);
      socket.off('projectsProjectsResult', handleProjectsResult);
      socket.off('projectsTasksResult', handleTasksResult);
      socket.off('projectsUpdateProjectResult', handleUpdateProjectResult);
      socket.off('projectsUpdateProjectError', handleUpdateProjectError);
      socket.off('bulkError', handleBulkError);
    };
  }, [socket, toast, selectedProjectId, handleFetchProjects, isUpdatingName]); 

  const fetchTasks = useCallback(() => {
      if (socket && activeProfileName && selectedProjectId && selectedProfile) {
        setIsDataLoading(true);
        const queryParams = { 
            project_id: selectedProjectId, 
            per_page: '100', 
        }; 
        socket.emit('getProjectsTasks', { selectedProfileName: activeProfileName, queryParams });
      } else {
          setTasks([]);
          setIsDataLoading(false);
      }
  }, [socket, activeProfileName, selectedProjectId, selectedProfile]);

  useEffect(() => {
      fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
        const project = projects.find(p => p.id === selectedProjectId);
        if (project) {
            setCurrentProjectName(project.name);
        }
    } else {
        setCurrentProjectName('');
    }
  }, [selectedProjectId, projects]);


  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'projects' });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      setActiveProfileName(profileName);
      setSelectedProjectId(null); 
      setProjects([]);
      setTasks([]);
      setAutoTaskListId(null);
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
    }
  };
  
  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'projects' });
    toast({ title: "Re-checking Connection..." });
  };
  
  const totalTasks = tasks.length;
  
  const stats = useMemo(() => ({
    totalTickets: jobState.results.length,
    successCount: jobState.results.filter(r => r.success).length,
    errorCount: jobState.results.filter(r => !r.success).length,
    processingTime: jobState.processingTime.toFixed(1) + 's',
    totalToProcess: jobState.totalToProcess,
    isProcessing: jobState.isProcessing,
    extraMetrics: [
        { label: "Tasks Found", value: totalTasks },
        { label: "Active Project", value: selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || "N/A" : "None" }
    ]
  }), [jobState, totalTasks, selectedProjectId, projects]);

  const handlePause = () => {
    if (socket && activeProfileName) {
      socket.emit('pauseJob', { profileName: activeProfileName, jobType: 'projects' });
      setJobs((prev) => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            isPaused: true
        }
      }));
    }
  };

  const handleResume = () => {
    if (socket && activeProfileName) {
      socket.emit('resumeJob', { profileName: activeProfileName, jobType: 'projects' });
      setJobs((prev) => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            isPaused: false
        }
      }));
    }
  };

  const handleEnd = () => {
    if (socket && activeProfileName) {
      socket.emit('endJob', { profileName: activeProfileName, jobType: 'projects' });
      setJobs((prev) => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            isProcessing: false, 
            isPaused: false
        }
      }));
    }
  };

  const handleClearJobLog = () => {
      setJobs((prev: any) => ({
          ...prev,
          [activeProfileName || '']: createInitialJobState(),
      }));
  };

  // --- NEW: RETRY FAILED LOGIC (FIXED) ---
  const handleRetryFailed = () => {
      if (!activeProfileName || !jobState) return;
      
      const failedItems = jobState.results.filter(r => !r.success);
      if (failedItems.length === 0) {
          toast({ title: "No failed items found to retry." });
          return;
      }

      // Assuming 'projectName' in result corresponds to the task name
      const failedNames = failedItems.map(r => r.projectName).join('\n'); 

      setJobs(prev => ({
          ...prev,
          [activeProfileName]: {
              ...prev[activeProfileName],
              isProcessing: false,
              isPaused: false,
              isComplete: false,
              results: [],
              processingTime: 0,
              totalToProcess: failedItems.length,
              formData: {
                  ...prev[activeProfileName].formData,
                  // FIX: Use 'primaryValues' as the text area binds to this field in TaskBulkForm
                  primaryValues: failedNames 
              }
          }
      }));
      toast({ title: "Retry Ready", description: `${failedItems.length} failed tasks loaded.` });
  };
  // ------------------------------

  return (
    <>
      <DashboardLayout 
        stats={stats} 
        onAddProfile={onAddProfile}
        profiles={projectsProfiles}
        selectedProfile={selectedProfile}
        jobs={jobs}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
        service={jobType}
      >
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
            
            {selectedProfile && (
                <Tabs defaultValue="bulk-create">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="bulk-create">Bulk Create Tasks</TabsTrigger>
                        <TabsTrigger value="view">View Tasks</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="bulk-create">
                        <div className="space-y-6">
                            <div>
                                <TaskBulkForm
                                    selectedProfileName={activeProfileName}
                                    projects={projects}
                                    socket={socket}
                                    jobState={jobState}
                                    setJobs={setJobs}
                                    createInitialJobState={createInitialJobState} 
                                    autoTaskListId={autoTaskListId}
                                    selectedProjectId={selectedProjectId}
                                    currentProjectName={currentProjectName}
                                    setCurrentProjectName={setCurrentProjectName}
                                    isUpdatingName={isUpdatingName}
                                    handleUpdateProjectName={handleUpdateProjectName}
                                />
                            </div>
                            <div>
                                <TaskProgressTable 
                                    results={jobState.results}
                                    isProcessing={jobState.isProcessing}
                                    isComplete={jobState.isComplete}
                                    totalToProcess={jobState.totalToProcess}
                                    countdown={jobState.countdown}
                                    filterText={jobState.filterText}
                                    onFilterTextChange={(text) => {
                                        setJobs((prev) => ({
                                            ...prev,
                                            [activeProfileName!]: {
                                                ...prev[activeProfileName!],
                                                filterText: text,
                                            },
                                        }));
                                    }}
                                    onRetry={handleRetryFailed} // Pass handler
                                />
                            </div>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="view">
                        <TaskResultsDisplay 
                            tasks={tasks} 
                            projects={projects}
                            selectedProjectId={selectedProjectId}
                            setSelectedProjectId={setSelectedProjectId}
                            fetchTasks={fetchTasks}
                        />
                    </TabsContent>

                </Tabs>
            )}
            
            {!selectedProfile && (
                <div className="text-center p-10 border rounded-lg">
                    {isDataLoading ? (
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                        <>
                            <p className="font-semibold">No Zoho Projects Profile Selected</p>
                            <p className="text-sm text-muted-foreground">Please select a profile or add a new one with Projects configuration.</p>
                        </>
                    )}
                </div>
            )}
        </div>
      </DashboardLayout>
      
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>API Connection Status</DialogTitle>
                <DialogDescription>This is the live status of the connection to the Zoho Projects API.</DialogDescription>
            </DialogHeader>
            <div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}>
                <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
                <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
            </div>
            {apiStatus.fullResponse && (
            <div className="mt-4">
                <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
                <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                    {JSON.stringify(apiStatus.fullResponse, null, 2)}
                </pre>
            </div>
            )}
            <DialogFooter>
                <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};