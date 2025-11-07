// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx (CORRECTED) ---

import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Loader2, Play, Pause, Square, Search, X } from 'lucide-react';
import { Profile } from '@/App';
import {
  ProjectsJobs,
  ProjectsJobState,
  ZohoProject,
  ZohoTaskList,
  ProjectCustomField,
} from './ProjectsDataTypes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface TaskBulkFormProps {
  selectedProfileName: string | null;
  activeProfile: Profile | null;
  projects: ZohoProject[];
  socket: Socket | null;
  jobState?: ProjectsJobState; 
  setJobs: React.Dispatch<React.SetStateAction<ProjectsJobs>>;
  autoTaskListId: string | null;
  customFields: ProjectCustomField[];
  isLoadingCustomFields: boolean;
}

const createInitialJobState = (): ProjectsJobState => ({
  formData: {
    taskNames: '',
    taskDescription: '',
    projectId: '',
    tasklistId: '',
    delay: 1,
    emails: '',
    custom_fields: {},
  },
  results: [],
  isProcessing: false,
  isPaused: false,
  isComplete: false,
  processingStartTime: null,
  processingTime: 0,
  totalToProcess: 0,
  countdown: 0,
  currentDelay: 1,
  filterText: '',
});

export const TaskBulkForm: React.FC<TaskBulkFormProps> = ({
  selectedProfileName,
  activeProfile,
  projects = [],
  socket,
  jobState = createInitialJobState(),
  setJobs,
  autoTaskListId,
  customFields = [],
  isLoadingCustomFields,
}) => {
  const { toast } = useToast();
  const { formData, isProcessing, isPaused } = jobState;

  const [taskLists, setTaskLists] = useState<ZohoTaskList[]>([]);
  const [isLoadingTaskLists, setIsLoadingTaskLists] = useState(false);
  const [isProjectPopoverOpen, setIsProjectPopoverOpen] = useState(false);
  const [isTaskListPopoverOpen, setIsTaskListPopoverOpen] = useState(false);

  const [localCustomFields, setLocalCustomFields] = useState<{ [key: string]: any }>(formData.custom_fields || {});

  const onFormDataChange = (newFormData: ProjectsJobState['formData']) => {
    if (selectedProfileName) {
      setJobs((prevJobs) => ({
        ...prevJobs,
        [selectedProfileName]: {
          ...(prevJobs[selectedProfileName] || createInitialJobState()), 
          formData: newFormData,
        },
      }));
    }
  };

  useEffect(() => {
    setLocalCustomFields(formData.custom_fields || {});
  }, [formData.custom_fields]);

  useEffect(() => {
    if (socket && formData.projectId) {
      setIsLoadingTaskLists(true);
      socket.emit('getProjectsTaskLists', {
        selectedProfileName: selectedProfileName,
        activeProfile: activeProfile,
        projectId: formData.projectId,
      });

      const handleTaskListsResult = (result: { success: boolean; data?: ZohoTaskList[]; error?: string }) => {
        setIsLoadingTaskLists(false);
        if (result.success && result.data) {
          setTaskLists(result.data);
        } else {
          setTaskLists([]);
          toast({ title: 'Error Fetching Task Lists', description: result.error || "Received invalid task list data.", variant: 'destructive' });
        }
      };

      socket.on('projectsTaskListsResult', handleTaskListsResult);
      return () => {
        socket.off('projectsTaskListsResult', handleTaskListsResult);
      };
    } else {
      setTaskLists([]);
    }
  }, [socket, formData.projectId, selectedProfileName, activeProfile, toast]);

  useEffect(() => {
    if (autoTaskListId && taskLists.some(tl => tl.id_string === autoTaskListId)) {
        if (formData.tasklistId !== autoTaskListId) {
            onFormDataChange({ ...formData, tasklistId: autoTaskListId });
        }
    }
  }, [autoTaskListId, taskLists, formData, onFormDataChange]);

  const handleProjectSelect = (projectId: string) => {
    onFormDataChange({ ...formData, projectId: projectId, tasklistId: '' });
    setIsProjectPopoverOpen(false);
  };

  const handleTaskListSelect = (taskListId: string) => {
    onFormDataChange({ ...formData, tasklistId: taskListId });
    setIsTaskListPopoverOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onFormDataChange({ ...formData, [e.target.id]: e.target.value });
  };

  const handleCustomFieldChange = (field_id: string, value: any) => {
    const newCustomFields = {
      ...localCustomFields,
      [field_id]: value,
    };
    setLocalCustomFields(newCustomFields);
    onFormDataChange({ ...formData, custom_fields: newCustomFields });
  };

  const selectedProject = projects.find(p => p.id_string === formData.projectId);
  const selectedTaskList = taskLists.find(tl => tl.id_string === formData.tasklistId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Create Tasks</CardTitle>
        <CardDescription>
          Enter multiple task names (one per line) and default settings to create them in bulk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="taskNames">Task Names (one per line)</Label>
            <Textarea
              id="taskNames"
              placeholder="Task 1&#10;Task 2&#10;Task 3"
              value={formData.taskNames}
              onChange={handleInputChange}
              rows={10}
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taskDescription">Default Task Description</Label>
            <Textarea
              id="taskDescription"
              placeholder="Default description for all tasks..."
              value={formData.taskDescription}
              onChange={handleInputChange}
              rows={10}
              disabled={isProcessing}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Popover open={isProjectPopoverOpen} onOpenChange={setIsProjectPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between" disabled={isProcessing}>
                  {selectedProject ? (
                    <span className="truncate">{selectedProject.name}</span>
                  ) : (
                    'Select a project'
                  )}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search projects..." />
                  <CommandEmpty>No project found.</CommandEmpty>
                  <CommandList>
                    {projects.map(project => (
                      <CommandItem
                        key={project.id_string}
                        value={project.name}
                        onSelect={() => handleProjectSelect(project.id_string)}
                      >
                        {project.name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Task List {isLoadingTaskLists && <Loader2 className="h-4 w-4 animate-spin inline-block ml-2" />}</Label>
            <Popover open={isTaskListPopoverOpen} onOpenChange={setIsTaskListPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={!formData.projectId || isLoadingTaskLists || isProcessing}
                >
                  {selectedTaskList ? (
                    <span className="truncate">{selectedTaskList.name}</span>
                  ) : (
                    'Select a task list'
                  )}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search task lists..." />
                  <CommandEmpty>No task list found.</CommandEmpty>
                  <CommandList>
                    {taskLists.map(list => (
                      <CommandItem
                        key={list.id_string}
                        value={list.name}
                        onSelect={() => handleTaskListSelect(list.id_string)}
                      >
                        {list.name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Default Custom Fields (Optional) {isLoadingCustomFields && <Loader2 className="h-4 w-4 animate-spin inline-block ml-2" />}</Label>
          <div className="p-4 border rounded-md space-y-4 max-h-60 overflow-y-auto">
            {customFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {isLoadingCustomFields ? 'Loading custom fields...' : 'No custom fields found for this project.'}
              </p>
            ) : (
              customFields.map(field => (
                <div key={field.id_string} className="space-y-2">
                  <Label htmlFor={field.id_string} className="text-xs font-medium">
                    {field.label_name}
                  </Label>
                  {field.column_name.startsWith('UDF_DATE') ? (
                    <Input
                      type="date"
                      id={field.id_string}
                      value={localCustomFields[field.id_string] || ''}
                      onChange={e => handleCustomFieldChange(field.id_string, e.target.value)}
                      disabled={isProcessing}
                    />
                  ) : (
                    <Input
                      type="text"
                      id={field.id_string}
                      placeholder={field.default_value || `Enter ${field.label_name}`}
                      value={localCustomFields[field.id_string] || ''}
                      onChange={e => handleCustomFieldChange(field.id_string, e.target.value)}
                      disabled={isProcessing}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="delay">Delay (in seconds)</Label>
            <Input
              id="delay"
              type="number"
              min="0.1"
              step="0.1"
              value={formData.delay}
              onChange={e => onFormDataChange({ ...formData, delay: parseFloat(e.target.value) || 0.1 })}
              disabled={isProcessing}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emails">Assign Users (Emails, comma-separated)</Label>
            <Input
              id="emails"
              type="text"
              placeholder="user1@example.com, user2@example.com"
              value={formData.emails || ''}
              onChange={handleInputChange}
              disabled={isProcessing}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex-1 flex gap-2">
          {!isProcessing ? (
            <Button
              onClick={() => {
                const allTaskNames = formData.taskNames.split('\n').map(name => name.trim()).filter(name => name !== '');
                if (allTaskNames.length === 0) {
                  toast({ title: 'No Tasks to Process', description: 'Please enter at least one task name.', variant: 'destructive' });
                  return;
                }
                if (!formData.projectId || !formData.tasklistId) {
                  toast({ title: 'Missing Information', description: 'Please select a project and a task list.', variant: 'destructive' });
                  return;
                }
                
                if (selectedProfileName) {
                    setJobs(prev => ({
                        ...prev,
                        [selectedProfileName]: {
                            ...jobState,
                            results: [],
                            isProcessing: true,
                            isPaused: false,
                            isComplete: false,
                            processingStartTime: new Date(),
                            totalToProcess: allTaskNames.length,
                            currentDelay: formData.delay,
                        }
                    }));
                }

                socket?.emit('startBulkCreateTasks', {
                  ...formData,
                  taskNames: allTaskNames,
                  selectedProfileName: selectedProfileName,
                  activeProfile: activeProfile,
                });
                
                toast({ title: `Processing Started`, description: `Creating ${allTaskNames.length} tasks...` });
              }}
              className="w-full sm:w-auto"
              // --- THIS IS THE FIX ---
              // Changed 'selectedProfile' to 'activeProfile'
              disabled={!socket || !activeProfile}
              // --- END OF FIX ---
            >
              <Play className="h-4 w-4 mr-2" />
              Start Bulk Create
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                    socket?.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: selectedProfileName, jobType: 'projects' });
                    if (selectedProfileName) {
                      setJobs(prev => ({
                        ...prev,
                        [selectedProfileName]: {
                          ...jobState,
                          isPaused: !isPaused
                        }
                      }));
                    }
                }}
                className="w-full sm:w-auto"
                variant={isPaused ? 'default' : 'secondary'}
              >
                {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                onClick={() => {
                    socket?.emit('endJob', { profileName: selectedProfileName, jobType: 'projects' });
                }}
                className="w-full sm:w-auto"
                variant="destructive"
              >
                <Square className="h-4 w-4 mr-2" />
                End Job
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};