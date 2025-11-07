// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx (FULL CODE - FIXED) ---
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectsJobState, ZohoProject } from './ProjectsDataTypes';
import { Loader2, Play, Pause, Square, ListFilterIcon } from 'lucide-react';
import { Socket } from 'socket.io-client';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from '@/components/ui/skeleton';

// --- Types for the Task Layout (from your Postman response) ---
interface TaskLayoutField {
    column_name: string; // <-- THIS IS THE KEY WE MUST USE
    display_name: string;
    i18n_display_name: string;
    column_type: string;
    is_mandatory: boolean;
    is_default: boolean;
    api_name: string; 
}

interface TaskLayoutSection {
    section_name: string;
    customfield_details: TaskLayoutField[];
}

interface TaskLayout {
    layout_id: string;
    section_details: TaskLayoutSection[];
    status_details: any[]; 
}
// --- END NEW TYPES ---


interface TaskBulkFormProps {
  selectedProfileName: string | null;
  projects: ZohoProject[];
  socket: Socket | null;
  jobState: ProjectsJobState;
  setJobs: React.Dispatch<React.SetStateAction<any>>;
  autoTaskListId: string | null;
}

const JobSummary: React.FC<{ jobState: ProjectsJobState }> = ({ jobState }) => {
    const { 
        results,
        processingTime, 
        isProcessing, 
        isComplete 
    } = jobState;
    
    if (!isProcessing && !isComplete) {
        return null;
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    const elapsedTime = `${processingTime} s`; 

    return (
        <div className="grid grid-cols-3 gap-4 text-center my-4">
            <div className="rounded-md border p-2">
                <p className="text-xl font-bold text-green-600">{successCount}</p>
                <p className="text-xs text-muted-foreground">Success</p>
            </div>
            <div className="rounded-md border p-2">
                <p className="text-xl font-bold text-red-600">{errorCount}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
            </div>
            <div className="rounded-md border p-2">
                <p className="text-xl font-bold text-primary">
                    {elapsedTime}
                </p>
                <p className="text-xs text-muted-foreground">Time Elapsed</p>
            </div>
        </div>
    );
};


export const TaskBulkForm: React.FC<TaskBulkFormProps> = ({ 
    selectedProfileName, 
    projects, 
    socket, 
    jobState, 
    setJobs, 
    autoTaskListId 
}) => {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState<string>('');
  const [taskNamesInput, setTaskNamesInput] = useState('');
  // const [taskDescription, setTaskDescription] = useState(''); // <-- REMOVED
  const [delay, setDelay] = useState(1);
  const isProcessing = jobState.isProcessing;

  // --- NEW STATE FOR DYNAMIC FIELDS ---
  const [taskLayout, setTaskLayout] = useState<TaskLayout | null>(null);
  const [allFields, setAllFields] = useState<TaskLayoutField[]>([]);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);
  const [dynamicFieldValues, setDynamicFieldValues] = useState<Record<string, string>>({});
  // --- END OF NEW STATE ---

  useEffect(() => {
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  // --- NEW: Effect to listen for layout results ---
  useEffect(() => {
    if (!socket) return;

    const handleTaskLayoutResult = (result: { success: boolean; data?: TaskLayout; message?: string; error?: string }) => {
        setIsLoadingLayout(false);
        if (result.success && result.data) {
            setTaskLayout(result.data);
            
            // Flatten all fields from all sections
            const all = result.data.section_details.flatMap(section => section.customfield_details);
            
            // Filter out default system fields to keep the list clean
            const customOnly = all.filter(field => !field.is_default);
            setAllFields(customOnly);

            // Initialize visibility: show all by default
            const initialVisibility = customOnly.reduce((acc, field) => {
                // --- FIX: Use column_name for the key ---
                acc[field.column_name] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setVisibleFields(initialVisibility);

        } else {
            toast({ title: 'Error fetching task layout', description: result.message || result.error, variant: 'destructive' });
            setTaskLayout(null);
            setAllFields([]);
        }
    };

    const handleTaskLayoutError = (error: { message: string }) => {
        setIsLoadingLayout(false);
        toast({ title: 'Error fetching layout', description: error.message, variant: 'destructive' });
    };

    socket.on('projectsTaskLayoutResult', handleTaskLayoutResult);
    socket.on('projectsTaskLayoutError', handleTaskLayoutError);

    return () => {
        socket.off('projectsTaskLayoutResult', handleTaskLayoutResult);
        socket.off('projectsTaskLayoutError', handleTaskLayoutError);
    };
  }, [socket, toast]);

  // --- NEW: Effect to fetch layout when project changes ---
  useEffect(() => {
    // --- THIS IS THE FIX ---
    // We must clear the old values *before* checking if we should fetch new ones.
    setAllFields([]);
    setTaskLayout(null);
    setDynamicFieldValues({}); // <-- This clears the "ghost" UDF_CHAR82 value
    // --- END FIX ---

    if (socket && selectedProfileName && projectId) {
        setIsLoadingLayout(true);
        
        socket.emit('getProjectsTaskLayout', {
            selectedProfileName,
            projectId
        });
    }
  }, [socket, selectedProfileName, projectId]); // This hook runs when projectId changes
  // --- END NEW EFFECTS ---

  const handleStart = () => {
    if (!selectedProfileName || !projectId || !autoTaskListId) {
      return toast({
        title: 'Validation Error',
        description: 'Please select a profile and project. Then, go to "View Tasks" to load a task list.',
        variant: 'destructive',
      });
    }

    const taskNames = taskNamesInput.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    
    if (taskNames.length === 0) {
        return toast({
            title: 'Validation Error',
            description: 'Please enter task names (one per line).',
            variant: 'destructive',
        });
    }

    if (!socket) {
        return toast({ title: 'Connection Error', description: 'Socket not connected.', variant: 'destructive' });
    }

    // --- MODIFIED to include bulkDefaultData ---
    const formData: ProjectsJobState['formData'] = { 
        taskNames: taskNamesInput, // Send raw string, server will split
        projectId, 
        tasklistId: autoTaskListId, 
        taskDescription: '', // <-- REMOVED (set to empty)
        delay, 
        displayName: selectedProfileName,
        bulkDefaultData: dynamicFieldValues // <-- ADDED DYNAMIC FIELDS
    };

    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [selectedProfileName]: {
        ...jobState,
        formData, // <-- Use the new formData object
        totalToProcess: taskNames.length,
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        processingTime: 0, 
        results: [],
        currentDelay: delay,
      },
    }));

    // --- MODIFIED to send all data in one object ---
    socket.emit('startBulkCreateTasks', {
        selectedProfileName,
        taskNames, // Send split array
        projectId,
        tasklistId: autoTaskListId,
        taskDescription: '', // <-- REMOVED (set to empty)
        delay,
        bulkDefaultData: dynamicFieldValues // <-- ADDED DYNAMIC FIELDS
    });
    // --- END MODIFICATION ---
    
    toast({ title: 'Bulk Task Job Started', description: `${taskNames.length} tasks queued.` });
  };
  
  const handlePause = () => {
    if (socket && selectedProfileName) {
        socket.emit('pauseJob', { profileName: selectedProfileName, jobType: 'projects' });
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...prev[selectedProfileName], isPaused: true },
        }));
        toast({ title: 'Job Paused' });
    }
  };

  const handleResume = () => {
    if (socket && selectedProfileName) {
        socket.emit('resumeJob', { profileName: selectedProfileName, jobType: 'projects' });
        setJobs((prev: any) => ({
            ...prev,
            [selectedProfileName]: { ...prev[selectedProfileName], isPaused: false },
        }));
        toast({ title: 'Job Resumed' });
    }
  };

  const handleEnd = () => {
    if (socket && selectedProfileName) {
        socket.emit('endJob', { profileName: selectedProfileName, jobType: 'projects' });
        toast({ title: 'Job Stopping' });
    }
  };

  // --- NEW: Helper to render correct input ---
  const handleDynamicFieldChange = (columnName: string, value: string) => {
    // --- FIX: Use column_name as the key ---
    setDynamicFieldValues(prev => ({ ...prev, [columnName]: value }));
  };

  const renderField = (field: TaskLayoutField) => {
    let inputType = "text";
    if (field.column_type === "date") inputType = "date";
    if (field.column_type === "email") inputType = "email";
    if (field.column_type === "decimal" || field.column_type === "number") inputType = "number";
    
    // --- FIX: Use column_name as the key ---
    const fieldKey = field.column_name;

    if (field.column_type === "picklist") {
         // A "smart" version 2 would fetch picklist options.
         return <Input 
            placeholder={field.i18n_display_name} 
            value={dynamicFieldValues[fieldKey] || ''}
            onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
            disabled={isProcessing}
         />
    }

    if (field.column_type === "multiline") {
        return <Textarea 
            placeholder={field.i18n_display_name} 
            value={dynamicFieldValues[fieldKey] || ''}
            onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
            disabled={isProcessing}
        />
    }
    
    return <Input 
        type={inputType} 
        placeholder={field.i18n_display_name} 
        value={dynamicFieldValues[fieldKey] || ''}
        onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
        disabled={isProcessing}
    />
  };
  // --- END NEW HELPER ---

  const isPaused = jobState.isPaused;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Bulk Create Zoho Project Tasks</CardTitle>
            {/* --- NEW: Customize Fields Dropdown --- */}
            {projectId && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isLoadingLayout || isProcessing}>
                            <ListFilterIcon className="mr-2 h-4 w-4" />
                            Customize Fields
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Show/Hide Custom Fields</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isLoadingLayout ? (
                            <DropdownMenuLabel>Loading...</DropdownMenuLabel>
                        ) : allFields.length > 0 ? (
                            allFields.map((field) => (
                                <DropdownMenuCheckboxItem
                                    // --- FIX: Use column_name for the key ---
                                    key={field.column_name}
                                    checked={visibleFields[field.column_name] ?? false}
                                    onCheckedChange={(checked) =>
                                        setVisibleFields(prev => ({
                                            ...prev,
                                            [field.column_name]: !!checked
                                        }))
                                    }
                                >
                                    {field.i18n_display_name || field.display_name}
                                </DropdownMenuCheckboxItem>
                            ))
                        ) : (
                            <DropdownMenuLabel>No custom fields found.</DropdownMenuLabel>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {/* --- END NEW DROPDOWN --- */}
        </div>
        <CardDescription>
            Enter task names (one per line) to be created in the selected project with an optional delay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label htmlFor="projectId">Project</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={isProcessing || projects.length === 0}>
                  <SelectTrigger id="projectId">
                    <SelectValue placeholder="Select a Project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            </div>
            
            <div className="grid gap-2">
                <Label htmlFor="tasklistId">Task List ID (Automatic)</Label>
                <Input
                    id="tasklistId"
                    readOnly
                    value={autoTaskListId || ''}
                    placeholder="Load 'View Tasks' tab first"
                    className={!autoTaskListId ? 'border-red-500' : 'bg-muted'}
                />
                {!autoTaskListId && (
                    <p className="text-xs text-red-500">
                        Go to 'View Tasks' tab to set this.
                    </p>
                )}
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="taskNamesInput">Task Names (One per line) *</Label>
            <Textarea
              id="taskNamesInput"
              placeholder="Task 1&#10;Task 2&#10;Task 3"
              rows={8}
              value={taskNamesInput}
              onChange={(e) => setTaskNamesInput(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          
          {/* --- FIELD REMOVED --- */}
          
          {/* --- NEW: DYNAMIC FIELDS AREA --- */}
          {isLoadingLayout && (
              <div className="space-y-4 rounded-md border p-4">
                  <Label className="text-base font-medium">Custom Fields</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-9 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-9 w-full" />
                    </div>
                  </div>
              </div>
          )}
          
          {!isLoadingLayout && allFields.length > 0 && (
              <div className="space-y-4 rounded-md border p-4">
                  <Label className="text-base font-medium">Custom Fields</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {allFields
                          // --- FIX: Use column_name for the key ---
                          .filter(field => visibleFields[field.column_name]) // Only show visible
                          .map(field => (
                              <div key={field.column_name} className="grid gap-2">
                                  <Label htmlFor={field.column_name}>{field.i18n_display_name}</Label>
                                  {renderField(field)}
                              </div>
                          ))
                      }
                  </div>
              </div>
          )}
          {/* --- END OF DYNAMIC FIELDS AREA --- */}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="delay">Delay Between Tasks (seconds)</Label>
              <Input
                id="delay"
                type="number"
                min="0"
                value={delay}
                onChange={(e) => setDelay(Math.max(0, parseInt(e.target.value)))}
                disabled={isProcessing}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tasks in Queue</Label>
              <Input
                value={taskNamesInput.split('\n').filter(name => name.trim().length > 0).length}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

          <JobSummary jobState={jobState} />
          
          <div className="mt-2 flex space-x-2">
            {!isProcessing && (
              <Button onClick={handleStart} className="w-full" disabled={!selectedProfileName || projects.length === 0 || taskNamesInput.trim().length === 0 || !autoTaskListId}>
                <Play className="mr-2 h-4 w-4" /> Start Bulk Creation
              </Button>
            )}
            
            {isProcessing && !isPaused && (
              <Button onClick={handlePause} className="w-1/2" variant="outline">
                <Pause className="mr-2 h-4 w-4" /> Pause
              </Button>
            )}
            
            {isProcessing && isPaused && (
              <Button onClick={handleResume} className="w-1/2">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resume
              </Button>
            )}
            
            {isProcessing && (
              <Button onClick={handleEnd} className="w-1/2" variant="destructive">
                <Square className="mr-2 h-4 w-4" /> End Job
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};