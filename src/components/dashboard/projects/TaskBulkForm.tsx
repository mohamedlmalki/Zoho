// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx (FULL CODE - FIXED) ---
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'; // Added useCallback
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectsJobState, ZohoProject, ProjectsFormData } from './ProjectsDataTypes'; // Import ProjectsFormData
import { Loader2, Play, Pause, Square, ListFilterIcon, ImagePlus, Eye } from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

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

// --- ADDED: Image Tool Dialog Component ---
const ImageToolDialog = ({ onApply }: { onApply: (html: string) => void }) => {
    const [imageUrl, setImageUrl] = useState('');
    const [altText, setAltText] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [width, setWidth] = useState('80');
    const [maxWidth, setMaxWidth] = useState('500');
    const [alignment, setAlignment] = useState('center');
    const [isOpen, setIsOpen] = useState(false);

    const handleApply = () => {
        let style = `width: ${width}%; max-width: ${maxWidth}px; height: auto; border: 1px solid #dddddd; margin-top: 10px; margin-bottom: 10px;`;
        let imgTag = `<img src="${imageUrl}" alt="${altText}" style="${style}" />`;
        
        if (linkUrl) {
            imgTag = `<a href="${linkUrl}">${imgTag}</a>`;
        }

        const containerStyle = `text-align: ${alignment};`;
        const finalHtml = `<div style="${containerStyle}">${imgTag}</div>`;
        
        onApply(finalHtml);
        setIsOpen(false);
        // Reset fields
        setImageUrl('');
        setAltText('');
        setLinkUrl('');
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <ImagePlus className="h-3 w-3 mr-1" />
                    Add Image
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add and Style Image</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
                        <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/image.png" />
                    </div>
                    {imageUrl && (
                        <div className="col-span-4 flex justify-center p-4 bg-muted rounded-md">
                            <img src={imageUrl} alt="Preview" className="max-w-full max-h-48" />
                        </div>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="altText" className="text-right">Alt Text</Label>
                        <Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="col-span-3" placeholder="Description of the image" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="linkUrl" className="text-right">Link URL</Label>
                        <Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="col-span-3" placeholder="(Optional) Make image clickable" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="width" className="text-right">Width (%)</Label>
                        <Input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="maxWidth" className="text-right">Max Width (px)</Label>
                        <Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="alignment" className="text-right">Alignment</Label>
                        <Select value={alignment} onValueChange={setAlignment}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleApply} disabled={!imageUrl}>Apply and Insert</Button>
            </DialogContent>
        </Dialog>
    );
};
// --- END OF ADDED COMPONENT ---


interface TaskBulkFormProps {
  selectedProfileName: string | null;
  projects: ZohoProject[];
  socket: Socket | null;
  jobState: ProjectsJobState;
  setJobs: React.Dispatch<React.SetStateAction<any>>;
  autoTaskListId: string | null;
}

// --- JobSummary component is INSIDE this file (like your original) ---
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
  const isProcessing = jobState.isProcessing;
  const isPaused = jobState.isPaused; 

  const [taskLayout, setTaskLayout] = useState<TaskLayout | null>(null);
  const [allFields, setAllFields] = useState<TaskLayoutField[]>([]);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);

  // --- MODIFIED: Wrapped form handlers in useCallback ---
  const handleFormDataChange = useCallback((field: keyof ProjectsFormData, value: any) => {
    if (!selectedProfileName) return;
    setJobs((prev: any) => {
      if (!prev[selectedProfileName]) {
        console.error("No profile found in setJobs for handleFormDataChange");
        return prev;
      }
      return {
        ...prev,
        [selectedProfileName]: {
          ...prev[selectedProfileName],
          formData: {
            ...prev[selectedProfileName].formData,
            [field]: value,
          },
        },
      };
    });
  }, [selectedProfileName, setJobs]); // Dependencies

  const handleDynamicFieldChange = useCallback((columnName: string, value: string) => {
    if (!selectedProfileName) return;
    setJobs((prev: any) => {
      if (!prev[selectedProfileName]) {
        console.error("No profile found in setJobs for handleDynamicFieldChange");
        return prev;
      }
      return {
        ...prev,
        [selectedProfileName]: {
          ...prev[selectedProfileName],
          formData: {
            ...prev[selectedProfileName].formData,
            bulkDefaultData: {
              ...prev[selectedProfileName].formData.bulkDefaultData,
              [columnName]: value,
            },
          },
        },
      };
    });
  }, [selectedProfileName, setJobs]); // Dependencies
  // --- END OF MODIFICATION ---


  // --- THIS IS THE NEW, COMBINED PROJECT CHANGE HANDLER ---
  const onProjectChange = useCallback((newProjectId: string) => {
    // 1. Set the new project ID
    handleFormDataChange('projectId', newProjectId);
    
    // 2. Clear the old layout data to trigger a re-fetch
    setAllFields([]);
    setTaskLayout(null);
    
    // 3. Reset the form fields that depend on the layout
    handleFormDataChange('bulkDefaultData', {});
    handleFormDataChange('primaryField', 'name');
  }, [handleFormDataChange]); // Depends on the stable handleFormDataChange
  // --- END OF NEW HANDLER ---


  // --- Automatically select the first project ---
  useEffect(() => {
    if (projects.length > 0 && !jobState.formData.projectId) { // Only set if no project is selected
      // Call the new handler to explicitly set project AND clear fields
      onProjectChange(projects[0].id);
    }
  }, [projects, jobState.formData.projectId, onProjectChange]); // Added onProjectChange


  // --- UNCHANGED: Effect to listen for layout results ---
  useEffect(() => {
    if (!socket) return;

    const handleTaskLayoutResult = (result: { success: boolean; data?: TaskLayout; message?: string; error?: string }) => {
        setIsLoadingLayout(false);
        if (result.success && result.data) {
            setTaskLayout(result.data);
            
            const all = result.data.section_details.flatMap(section => section.customfield_details);
            const customOnly = all.filter(field => !field.is_default);
            setAllFields(customOnly);

            const initialVisibility = customOnly.reduce((acc, field) => {
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


  // --- SIMPLIFIED: Effect to fetch layout ---
  useEffect(() => {
    const currentProjectId = jobState.formData.projectId;

    // Only fetch if we have a project ID and NO layout data
    if (socket && selectedProfileName && currentProjectId && !taskLayout) {
      setIsLoadingLayout(true);
      socket.emit('getProjectsTaskLayout', {
          selectedProfileName,
          projectId: currentProjectId
      });
    }
  }, [socket, selectedProfileName, jobState.formData.projectId, taskLayout]); // Simplified dependencies
  // --- END OF SIMPLIFIED EFFECT ---


  // --- Generate Primary Field Options ---
  const primaryFieldOptions = useMemo(() => {
    const options = [
      { value: 'name', label: 'Task Name' }
    ];

    if (allFields.length > 0) {
      allFields.forEach(field => {
          options.push({
            value: field.column_name,
            label: field.display_name
          });
        });
    }
    return options;
  }, [allFields]);

  // --- MODIFIED EFFECT: Set default primary field to 'email' if found (and not already set) ---
  useEffect(() => {
    // Only run if fields are loaded AND primaryField is still default 'name'
    if (allFields.length > 0 && jobState.formData.primaryField === 'name') {
      const emailField = allFields.find(field => 
        field.display_name.toLowerCase().includes('email') || 
        field.i18n_display_name.toLowerCase().includes('email')
      );
      
      if (emailField) {
        handleFormDataChange('primaryField', emailField.column_name);
      }
    }
  }, [allFields, jobState.formData.primaryField, handleFormDataChange]); // Added handleFormDataChange
  // --- END NEW EFFECT ---

  const handleStart = () => {
    const { projectId, primaryValues, delay } = jobState.formData; // Read from global state

    if (!selectedProfileName || !projectId || !autoTaskListId) {
      return toast({
        title: 'Validation Error',
        description: 'Please select a profile and project. Then, go to "View Tasks" to load a task list.',
        variant: 'destructive',
      });
    }

    const tasksToProcess = primaryValues.split('\n').map(name => name.trim()).filter(name => name.length > 0);
    
    if (tasksToProcess.length === 0) {
        return toast({
            title: 'Validation Error',
            description: 'Please enter at least one Primary Field Value.',
            variant: 'destructive',
        });
    }

    if (!socket) {
        return toast({ title: 'Connection Error', description: 'Socket not connected.', variant: 'destructive' });
    }

    const formData: ProjectsFormData = {
      ...jobState.formData, // Get all the persistent form data
      tasklistId: autoTaskListId, // Add the non-persistent tasklistId
      displayName: selectedProfileName,
    };

    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [selectedProfileName]: {
        ...jobState,
        formData, // <-- Set the complete formData
        totalToProcess: tasksToProcess.length,
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        processingTime: 0, 
        results: [],
        currentDelay: delay,
      },
    }));

    socket.emit('startBulkCreateTasks', {
        selectedProfileName,
        activeProfile: { projects: { portalId: projects.find(p => p.id === projectId)?.portal_id } }, // Send portalId
        formData: formData // Send the whole form data object
    });
    
    toast({ title: 'Bulk Task Job Started', description: `${tasksToProcess.length} tasks queued.` });
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

  // --- MODIFIED: `renderField` no longer handles multiline ---
  const renderField = (field: TaskLayoutField) => {
    let inputType = "text";
    if (field.column_type === "date") inputType = "date";
    if (field.column_type === "email") inputType = "email";
    if (field.column_type === "decimal" || field.column_type === "number") inputType = "number";
    
    const fieldKey = field.column_name;

    if (field.column_type === "picklist") {
         return <Input 
            placeholder={field.i18n_display_name} 
            value={jobState.formData.bulkDefaultData[fieldKey] || ''} // Read from global state
            onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
            disabled={isProcessing}
         />
    }
    
    return <Input 
        type={inputType} 
        placeholder={field.i18n_display_name} 
        value={jobState.formData.bulkDefaultData[fieldKey] || ''} // Read from global state
        onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
        disabled={isProcessing}
    />
  };
  // --- END MODIFICATION ---

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Bulk Create Zoho Project Tasks</CardTitle>
            {jobState.formData.projectId && (
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
        </div>
        <CardDescription>
            Enter task names (one per line) to be created in the selected project with an optional delay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* 1. Project */}
            <div className="grid gap-2">
                <Label htmlFor="projectId">Project</Label>
                <Select 
                  value={jobState.formData.projectId || ''} // Read from global state
                  onValueChange={onProjectChange} // <-- USE THE NEW HANDLER
                  disabled={isProcessing || projects.length === 0}
                >
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
            
            {/* 2. Task List ID */}
            <div className="grid gap-2">
                <Label htmlFor="tasklistId">Task List ID (Auto)</Label>
                <Input
                    id="tasklistId"
                    readOnly
                    value={autoTaskListId || ''}
                    placeholder="Load 'View Tasks' tab"
                    className={!autoTaskListId ? 'border-red-500' : 'bg-muted'}
                />
                {!autoTaskListId && (
                    <p className="text-xs text-red-500">
                        Go to 'View Tasks' tab.
                    </p>
                )}
            </div>

            {/* 3. Delay */}
            <div className="grid gap-2">
              <Label htmlFor="delay">Delay (s)</Label>
              <Input
                id="delay"
                type="number"
                min="0.5"
                step="0.1"
                value={jobState.formData.delay} // Read from global state
                onChange={(e) => handleFormDataChange('delay', Math.max(0.5, parseFloat(e.target.value) || 0.5))} // Write to global state
                disabled={isProcessing}
              />
            </div>

            {/* 4. Queue */}
            <div className="grid gap-2">
              <Label>Tasks in Queue</Label>
              <Input
                value={jobState.formData.primaryValues.split('\n').filter(name => name.trim().length > 0).length} // Read from global state
                readOnly
                className="bg-muted"
              />
            </div>
          </div>


          <hr className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* --- LEFT COLUMN --- */}
            <div className="space-y-6">
                {/* 1. Primary Field (Dropdown) */}
                <div className="grid gap-2">
                    <Label htmlFor="primaryField">Primary Field (List)</Label>
                    <Select 
                      value={jobState.formData.primaryField} // Read from global state
                      onValueChange={(value) => handleFormDataChange('primaryField', value)} // Write to global state
                      disabled={isProcessing || isLoadingLayout}
                    >
                        <SelectTrigger id="primaryField">
                            <SelectValue placeholder="Select a field to bulk" />
                        </SelectTrigger>
                        <SelectContent>
                            {primaryFieldOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Select the field you want to fill from the list below.
                    </p>
                </div>
                
                {/* 2. Primary Values (Textarea) */}
                <div className="grid gap-2">
                    <Label htmlFor="primaryValues">Primary Field Values (one per line)</Label>
                    <Textarea
                    id="primaryValues"
                    placeholder="Paste your list here, e.g., a list of emails or task names."
                    rows={8}
                    value={jobState.formData.primaryValues} // Read from global state
                    onChange={(e) => handleFormDataChange('primaryValues', e.target.value)} // Write to global state
                    disabled={isProcessing}
                    />
                </div>
            </div>
            
            {/* --- RIGHT COLUMN --- */}
            <div className="space-y-6">
                {/* 4. DYNAMIC FIELDS AREA --- */}
                {isLoadingLayout && (
                    <div className="space-y-4 rounded-md border p-4">
                        <Label className="text-base font-medium">Custom Fields</Label>
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-1/3" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    </div>
                )}
                
                {!isLoadingLayout && allFields.length > 0 && (
                    <div className="space-y-4 rounded-md border p-4">
                        <Label className="text-base font-medium">Custom Fields (Defaults)</Label>
                        <div className="grid grid-cols-1 gap-4">
                            {allFields
                                .filter(field => 
                                    visibleFields[field.column_name] && // Is it visible?
                                    field.column_name !== jobState.formData.primaryField  // Is it NOT the primary field?
                                ) 
                                .map(field => {
                                    const fieldKey = field.column_name;
                                    const currentFieldValue = jobState.formData.bulkDefaultData[fieldKey] || '';

                                    // Specific handler for this field
                                    const handleApplyImageToField = (html: string) => {
                                        handleDynamicFieldChange(fieldKey, currentFieldValue + '\n' + html);
                                    };

                                    if (field.column_type === "multiline") {
                                        return (
                                            <div key={fieldKey} className="grid gap-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor={fieldKey}>{field.i18n_display_name}</Label>
                                                    <div className="flex items-center space-x-2">
                                                        <ImageToolDialog onApply={handleApplyImageToField} />
                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                                                    <Eye className="h-3 w-3 mr-1" />
                                                                    Preview
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="max-w-2xl">
                                                                <DialogHeader><DialogTitle>Preview</DialogTitle></DialogHeader>
                                                                <div
                                                                    className="p-4 bg-muted/30 rounded-lg border max-h-96 overflow-y-auto"
                                                                    dangerouslySetInnerHTML={{ __html: currentFieldValue }}
                                                                />
                                                            </DialogContent>
                                                        </Dialog>
                                                    </div>
                                                </div>
                                                <Textarea
                                                    id={fieldKey}
                                                    placeholder={field.i18n_display_name}
                                                    value={currentFieldValue} // Read from global state
                                                    onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
                                                    disabled={isProcessing}
                                                    className="min-h-[120px]"
                                                />
                                            </div>
                                        );
                                    }

                                    // Default rendering for other fields
                                    return (
                                        <div key={fieldKey} className="grid gap-2">
                                            <Label htmlFor={fieldKey}>{field.i18n_display_name}</Label>
                                            {renderField(field)}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </div>
                )}
                {/* --- END OF DYNAMIC FIELDS AREA --- */}
            </div>
          </div>


          <hr className="my-4" />

          <JobSummary jobState={jobState} />
          
          <div className="mt-2 flex space-x-2">
            {!isProcessing && (
              <Button onClick={handleStart} className="w-full" disabled={!selectedProfileName || projects.length === 0 || jobState.formData.primaryValues.trim().length === 0 || !autoTaskListId}>
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