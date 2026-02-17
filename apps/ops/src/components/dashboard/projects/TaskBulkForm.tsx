// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx ---
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectsJobState, ZohoProject, ProjectsFormData, ProjectsJobs } from './ProjectsDataTypes';
import { Loader2, Play, Pause, Square, ListFilterIcon, ImagePlus, Eye, Save, Upload, List, CheckCircle2, XCircle, Hash, AlertTriangle } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';

// ... (Keep your TaskLayoutField, TaskLayoutSection, TaskLayout interfaces and ImageToolDialog component as they are) ...

interface TaskLayoutField {
    column_name: string;
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

const ImageToolDialog = ({ onApply }: { onApply: (html: string) => void }) => {
    // ... (Keep ImageToolDialog implementation same as before) ...
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

// Helper for mm m ss s format
const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
};

interface TaskBulkFormProps {
  selectedProfileName: string | null;
  projects: ZohoProject[];
  socket: Socket | null;
  jobState: ProjectsJobState;
  setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
  autoTaskListId: string | null;
  selectedProjectId: string | null;
  currentProjectName: string;
  setCurrentProjectName: React.Dispatch<React.SetStateAction<string>>;
  isUpdatingName: boolean;
  handleUpdateProjectName: () => void;
  createInitialJobState?: () => ProjectsJobState; // Added to interface if needed, but not strictly required for the fix
}

export const TaskBulkForm: React.FC<TaskBulkFormProps> = ({ 
    selectedProfileName, 
    projects, 
    socket, 
    jobState, 
    setJobs, 
    autoTaskListId,
    selectedProjectId,
    currentProjectName,
    setCurrentProjectName,
    isUpdatingName,
    handleUpdateProjectName
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessing = jobState.isProcessing;
  const isPaused = jobState.isPaused; 
  const results = jobState.results || [];

  const [taskLayout, setTaskLayout] = useState<TaskLayout | null>(null);
  const [allFields, setAllFields] = useState<TaskLayoutField[]>([]);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [isLoadingLayout, setIsLoadingLayout] = useState(false);

  // Safely access stopAfterFailures from formData (needs interface update or cast)
  const stopAfterFailures = (jobState.formData as any).stopAfterFailures || 0;

  // --- FIX START: Safe State Update Logic ---
  const handleFormDataChange = useCallback((field: keyof ProjectsFormData | 'stopAfterFailures', value: any) => {
    if (!selectedProfileName) return;
    setJobs((prev) => {
      // FIX: Use 'jobState' prop (which contains initial state) if 'prev[selectedProfileName]' is missing
      const prevJobState = prev[selectedProfileName] || jobState;
      
      return {
        ...prev,
        [selectedProfileName]: {
          ...prevJobState, 
          formData: {
            ...prevJobState.formData, 
            [field]: value, 
          },
        },
      };
    });
  }, [selectedProfileName, setJobs, jobState]); 

  const handleDynamicFieldChange = useCallback((columnName: string, value: string) => {
    if (!selectedProfileName) return;
    setJobs((prev) => {
      // FIX: Same fix here - ensure we default to jobState if missing
      const prevJobState = prev[selectedProfileName] || jobState;

      return {
        ...prev,
        [selectedProfileName]: {
          ...prevJobState,
          formData: {
            ...prevJobState.formData,
            bulkDefaultData: {
              ...prevJobState.formData.bulkDefaultData,
              [columnName]: value,
            },
          },
        },
      };
    });
  }, [selectedProfileName, setJobs, jobState]); 
  // --- FIX END ---

  const onProjectChange = useCallback((newProjectId: string) => {
    handleFormDataChange('projectId', newProjectId);
    setAllFields([]);
    setTaskLayout(null);
    handleFormDataChange('bulkDefaultData', {});
    handleFormDataChange('primaryField', 'name');
  }, [handleFormDataChange]); 

  useEffect(() => {
    // This logic now works because handleFormDataChange properly initializes the state
    if (projects.length > 0 && !jobState.formData.projectId) { 
      onProjectChange(projects[0].id);
    }
  }, [projects, jobState.formData.projectId, onProjectChange]); 


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


  useEffect(() => {
    const currentProjectId = jobState.formData.projectId;
    if (socket && selectedProfileName && currentProjectId && !taskLayout) {
      setIsLoadingLayout(true);
      socket.emit('getProjectsTaskLayout', {
          selectedProfileName,
          projectId: currentProjectId
      });
    }
  }, [socket, selectedProfileName, jobState.formData.projectId, taskLayout]); 

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

  useEffect(() => {
    if (allFields.length > 0 && jobState.formData.primaryField === 'name') {
      const emailField = allFields.find(field => 
        field.display_name.toLowerCase().includes('email') || 
        field.i18n_display_name.toLowerCase().includes('email')
      );
      if (emailField) {
        handleFormDataChange('primaryField', emailField.column_name);
      }
    }
  }, [allFields, jobState.formData.primaryField, handleFormDataChange]); 

  const handleStart = () => {
    const { projectId, primaryValues, delay } = jobState.formData; 

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
      ...jobState.formData, 
      tasklistId: autoTaskListId, 
      displayName: selectedProfileName,
      stopAfterFailures: stopAfterFailures // --- ADDED THIS ---
    };

    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [selectedProfileName]: {
        ...jobState,
        formData, 
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
        activeProfile: { projects: { portalId: projects.find(p => p.id === projectId)?.portal_id } }, 
        formData: formData 
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

  const renderField = (field: TaskLayoutField) => {
    let inputType = "text";
    if (field.column_type === "date") inputType = "date";
    if (field.column_type === "email") inputType = "email";
    if (field.column_type === "decimal" || field.column_type === "number") inputType = "number";
    
    const fieldKey = field.column_name;

    return <Input 
        type={inputType} 
        placeholder={field.i18n_display_name} 
        value={jobState.formData.bulkDefaultData[fieldKey] || ''} 
        onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
        disabled={isProcessing}
    />
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => handleFormDataChange('primaryValues', e.target?.result as string);
      reader.readAsText(file);
    }
  };

  // --- STATS LOGIC ---
  const primaryValuesCount = (jobState.formData.primaryValues || '').split('\n').filter(l => l.trim()).length;
  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const remainingCount = Math.max(0, (jobState.totalToProcess || primaryValuesCount) - results.length);

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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            
            <div className="grid gap-2">
                <Label htmlFor="projectName">Active Project Name</Label>
                <div className="flex space-x-2">
                    <Input
                        id="projectName"
                        value={currentProjectName}
                        onChange={(e) => setCurrentProjectName(e.target.value)}
                        placeholder={"Select a project"}
                        disabled={isUpdatingName || !selectedProjectId}
                    />
                    <Button
                        variant="default"
                        size="icon"
                        onClick={handleUpdateProjectName}
                        disabled={isUpdatingName || !selectedProjectId}
                    >
                        {isUpdatingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
			
            <div className="grid gap-2">
                <Label htmlFor="projectId">Project</Label>
                <Select 
                  value={jobState.formData.projectId || ''} 
                  onValueChange={onProjectChange} 
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

            <div className="grid gap-2">
              <Label htmlFor="delay">Delay (s)</Label>
              <Input
                id="delay"
                type="number"
                min="0.5"
                step="0.1"
                value={jobState.formData.delay} 
                onChange={(e) => handleFormDataChange('delay', Math.max(0.5, parseFloat(e.target.value) || 0.5))} 
                disabled={isProcessing}
              />
            </div>

            {/* --- NEW: Auto Pause Input --- */}
            <div className="grid gap-2">
              <Label htmlFor="stopAfterFailures" className="flex items-center space-x-1 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>Auto-Pause</span>
              </Label>
              <Input
                id="stopAfterFailures"
                type="number"
                min="0"
                step="1"
                placeholder="0 (Disabled)"
                value={stopAfterFailures === 0 ? '' : stopAfterFailures}
                onChange={(e) => {
                    const val = e.target.value;
                    handleFormDataChange('stopAfterFailures' as any, val === '' ? 0 : parseInt(val));
                }}
                className="placeholder:text-muted-foreground/70"
                disabled={isProcessing}
              />
            </div>
            {/* ----------------------------- */}

          </div>

          <hr className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="primaryField">Primary Field (List)</Label>
                    <Select 
                      value={jobState.formData.primaryField} 
                      onValueChange={(value) => handleFormDataChange('primaryField', value)} 
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
                
                <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="primaryValues">Primary Field Values (one per line)</Label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".txt,.csv"
                                onChange={handleFileImport}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="h-6 text-xs"
                            >
                                <Upload className="h-3 w-3 mr-1" /> Import
                            </Button>
                            <Badge variant="secondary" className="text-xs h-6">
                                <List className="h-3 w-3 mr-1" />
                                {primaryValuesCount}
                            </Badge>
                        </div>
                    </div>
                    <Textarea
                    id="primaryValues"
                    placeholder="Paste your list here, e.g., a list of emails or task names."
                    rows={8}
                    value={jobState.formData.primaryValues} 
                    onChange={(e) => handleFormDataChange('primaryValues', e.target.value)} 
                    disabled={isProcessing}
                    />
                </div>
            </div>
            
            <div className="space-y-6">
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
                                    visibleFields[field.column_name] && 
                                    field.column_name !== jobState.formData.primaryField  
                                ) 
                                .map(field => {
                                    const fieldKey = field.column_name;
                                    const currentFieldValue = jobState.formData.bulkDefaultData[fieldKey] || '';

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
                                                    value={currentFieldValue} 
                                                    onChange={(e) => handleDynamicFieldChange(fieldKey, e.target.value)}
                                                    disabled={isProcessing}
                                                    className="min-h-[120px]"
                                                />
                                            </div>
                                        );
                                    }

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
            </div>
          </div>

          {(isProcessing || results.length > 0) && (
            <div className="pt-4 border-t border-dashed">
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                        <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                        <p className="text-lg font-bold font-mono">{formatDuration(jobState.processingTime)}</p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Success</Label>
                        <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{successCount}</span>
                        </p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Failed</Label>
                        <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                            <XCircle className="h-4 w-4" />
                            <span>{errorCount}</span>
                        </p>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Remaining</Label>
                        <p className="text-lg font-bold font-mono text-muted-foreground flex items-center justify-center space-x-1">
                            <Hash className="h-4 w-4" />
                            <span>{remainingCount >= 0 ? remainingCount : 0}</span>
                        </p>
                    </div>
                </div>
            </div>
          )}

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