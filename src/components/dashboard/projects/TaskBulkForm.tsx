// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx (FULL CODE - FIXED) ---
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectsJobState, ZohoProject } from './ProjectsDataTypes'; // Import from DataTypes
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

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
// REMOVED the broken import for JobSummary

// --- Types for the Task Layout (from your Postman response) ---
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
// --- END NEW TYPES ---

// --- NEW FORM SCHEMA ---
const formSchema = z.object({
  projectId: z.string().min(1, "Project is required."),
  tasklistId: z.string().min(1, "Task List is required."),
  
  // 1. Task Name is now a single string
  taskName: z.string().min(1, "Task Name is required."),
  
  // 2. NEW: Primary Field (the dropdown)
  primaryField: z.string().min(1, "Primary Field is required."),
  
  // 3. NEW: Primary Values (the list)
  primaryValues: z.string().min(1, "At least one primary value is required."),

  taskDescription: z.string().optional(),
  delay: z.coerce.number().min(0.5, "Delay must be at least 0.5 seconds."),
  bulkDefaultData: z.record(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

// --- ADDED JobSummary COMPONENT BACK IN ---
// This was inside your original file
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
// --- END OF JobSummary COMPONENT ---


interface TaskBulkFormProps {
  jobState: ProjectsJobState;
  setJobState: React.Dispatch<React.SetStateAction<ProjectsJobState>>; // This should be ProjectsJobState
  socket: Socket | null;
  selectedProfileName: string;
  
  // Props from parent (ProjectsTasksDashboard)
  projects: ZohoProject[];
  tasklists: any[]; // You can use a more specific type
  layout: TaskLayout | null;
  isLayoutLoading: boolean;
  autoProjectId: string;
  setAutoProjectId: (id: string) => void;
  autoTaskListId: string | null; // This comes from parent
  setAutoTaskListId: (id: string) => void; // This comes from parent

  // Job controls from parent
  isProcessing: boolean;
  isPaused: boolean;
  handleStart: (formData: any) => void; // Use 'any' or 'FormValues'
  handlePause: () => void;
  handleResume: () => void;
  handleEnd: () => void;
  
  // Need setJobs from parent to update form state
  setJobs: React.Dispatch<React.SetStateAction<any>>; // Using 'any' as from your original file
}

export const TaskBulkForm: React.FC<TaskBulkFormProps> = ({ 
    jobState, 
    setJobState, // This prop seems unused in your original, but I'll keep it
    socket, 
    selectedProfileName,
    projects,
    tasklists,
    layout,
    isLayoutLoading,
    autoProjectId,
    setAutoProjectId,
    autoTaskListId,
    setAutoTaskListId,
    isProcessing,
    isPaused,
    handleStart,
    handlePause,
    handleResume,
    handleEnd,
    setJobs // This is needed for dynamic fields
}) => {
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Use the jobState.formData for default values
    defaultValues: jobState.formData,
  });

  // Update form default values when jobState changes (e.g., on profile selection)
  useEffect(() => {
    form.reset(jobState.formData);
  }, [jobState, form]);

  // Handle auto-selection of project and tasklist
  useEffect(() => {
    if (autoProjectId) {
      form.setValue('projectId', autoProjectId);
    }
  }, [autoProjectId, form]);

  useEffect(() => {
    if (autoTaskListId) {
      form.setValue('tasklistId', autoTaskListId);
    }
  }, [autoTaskListId, form]);

  // --- NEW: Generate Primary Field Options ---
  const primaryFieldOptions = React.useMemo(() => {
    const options = [
      // Add Task Name manually
      { value: 'name', label: 'Task Name' }
    ];

    if (layout && layout.section_details) {
      layout.section_details.forEach(section => {
        section.customfield_details.forEach(field => {
          options.push({
            value: field.column_name, // e.g., "UDF_CHAR82"
            label: field.display_name // e.g., "email2"
          });
        });
      });
    }
    return options;
  }, [layout]);
  
  // --- NEW: Watch values for UI updates ---
  const watchedPrimaryField = form.watch("primaryField");
  const watchedPrimaryValues = form.watch("primaryValues", "");

  const onSubmit = (data: FormValues) => {
    // Convert delay to number
    const finalData = {
      ...data,
      delay: Number(data.delay),
      // Make sure bulkDefaultData is an object
      bulkDefaultData: data.bulkDefaultData || {},
    };
    handleStart(finalData);
  };

  // --- NEW: Helper to render correct input ---
  const renderField = (field: TaskLayoutField) => {
    let inputType = "text";
    if (field.column_type === "date") inputType = "date";
    if (field.column_type === "email") inputType = "email";
    if (field.column_type === "decimal" || field.column_type === "number") inputType = "number";
    
    const fieldKey = `bulkDefaultData.${field.column_name}`;

    // This component will now be controlled by react-hook-form
    return (
      <FormField
        key={field.column_name}
        control={form.control}
        name={fieldKey as any} // Use 'as any' to allow dynamic keys
        render={({ field: formField }) => (
          <FormItem className="mt-4">
            <FormLabel>{field.display_name}</FormLabel>
            <FormControl>
              {field.column_type === "multiline" ? (
                <Textarea
                  placeholder={`Enter default ${field.display_name}`}
                  {...formField}
                  disabled={isProcessing}
                />
              ) : (
                <Input 
                  type={inputType}
                  placeholder={`Enter default ${field.display_name}`} 
                  {...formField}
                  disabled={isProcessing}
                />
              )}
            </FormControl>
            <FormDescription>
              API Key: {field.column_name} (Type: {field.column_type})
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };
  // --- END NEW HELPER ---


  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Bulk Create Zoho Project Tasks</CardTitle>
            {/* --- NEW: Customize Fields Dropdown --- */}
            {form.getValues('projectId') && (
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
                        ) : primaryFieldOptions.length > 1 ? ( // Check if layout has loaded
                            primaryFieldOptions.map((field) => (
                                // Don't show "Task Name" in this filter list
                                field.value === 'name' ? null :
                                <DropdownMenuCheckboxItem
                                    key={field.value}
                                    // Use form.watch() to get dynamic visibility
                                    checked={form.watch(`bulkDefaultData.${field.value}`) !== undefined}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        // When checking, set an empty string to make it visible
                                        form.setValue(`bulkDefaultData.${field.value}`, '');
                                      } else {
                                        // When unchecking, remove the field
                                        const currentData = form.getValues('bulkDefaultData') || {};
                                        delete currentData[field.value];
                                        form.setValue('bulkDefaultData', currentData);
                                        // Manually trigger re-render
                                        form.trigger('bulkDefaultData'); 
                                      }
                                    }}
                                >
                                    {field.label}
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
          Create multiple tasks from a list. Select a "Primary Field" (like 'Task Name' or 'email2')
          and provide a list of values for it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Project Select */}
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      setAutoProjectId(value); // Propagate change up
                      setAutoTaskListId(''); // Reset tasklist
                      form.setValue('tasklistId', ''); // Reset form
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Task List Select */}
              <FormField
                control={form.control}
                name="tasklistId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task List</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      setAutoTaskListId(value); // Propagate change up
                    }} value={field.value} disabled={!form.getValues('projectId') || tasklists.length === 0}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a task list" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tasklists.map((list) => (
                          <SelectItem key={list.id} value={list.id}>
                            {list.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!autoTaskListId && (
                      <p className="text-xs text-red-500">
                          Go to 'View Tasks' tab to set this.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <hr className="my-4" />

            {/* --- FORM FIELDS UPDATED --- */}

            {/* 1. Task Name (Single Input) */}
            <FormField
              control={form.control}
              name="taskName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., New Support Ticket" {...field} />
                  </FormControl>
                  <FormDescription>
                    If "Task Name" is not the Primary Field, this will be used as a template (e.g., "Task_1", "Task_2").
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 2. Primary Field (Dropdown) */}
            <FormField
              control={form.control}
              name="primaryField"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Field (List)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a field to bulk" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {primaryFieldOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the field you want to fill from the list below.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 3. Primary Values (Textarea) */}
            <FormField
              control={form.control}
              name="primaryValues"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Field Values (one per line)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste your list here. e.g., a list of emails or task names."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <hr className="my-4" />
            
            {/* Task Description */}
            <FormField
              control={form.control}
              name="taskDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Description (Default)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter a default description for all tasks"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Default Custom Fields */}
            {isLoadingLayout && (
              <div className="space-y-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            
            {layout && layout.section_details.map(section => (
              <div key={section.section_id}>
                {section.customfield_details
                  .filter(field => !field.is_default) // Hide default fields
                  .map(field => {
                    // --- NEW: Hide field if it's selected as the primary field
                    // OR if it's not in the visible list
                    const isVisible = form.watch(`bulkDefaultData.${field.column_name}`) !== undefined;
                    if (field.column_name === watchedPrimaryField || !isVisible) {
                      return null;
                    }
                    
                    // Use renderField to create the component
                    return renderField(field);
                  })}
              </div>
            ))}

            <hr className="my-4" />

            {/* Delay and Task Count */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="delay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delay (in seconds)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0.5" step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <Label>Tasks in Queue</Label>
                <Input
                  // --- UPDATED: Use watchedPrimaryValues ---
                  value={watchedPrimaryValues.split('\n').filter(name => name.trim().length > 0).length}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>

            <JobSummary jobState={jobState} />
            
            <div className="mt-2 flex space-x-2">
              {!isProcessing && (
                <Button type="submit" className="w-full" disabled={!selectedProfileName || projects.length === 0 || watchedPrimaryValues.trim().length === 0 || !autoTaskListId}>
                  <Play className="mr-2 h-4 w-4" /> Start Bulk Creation
                </Button>
              )}
              
              {isProcessing && !isPaused && (
                <Button type="button" onClick={handlePause} className="w-1/2" variant="outline">
                  <Pause className="mr-2 h-4 w-4" /> Pause
                </Button>
              )}
              
              {isProcessing && isPaused && (
                <Button type="button" onClick={handleResume} className="w-1/2">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resume
                </Button>
              )}
              
              {isProcessing && (
                <Button type="button" onClick={handleEnd} className="w-1/2" variant="destructive">
                  <Square className="mr-2 h-4 w-4" /> End Job
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};