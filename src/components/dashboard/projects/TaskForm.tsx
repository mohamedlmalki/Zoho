// --- FILE: src/components/dashboard/projects/TaskForm.tsx (FIXED) ---
import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

interface Project {
  id_string: string;
  name: string;
}

interface TaskList {
  id_string: string;
  name: string;
}

const formSchema = z.object({
  projectId: z.string().min(1, "Project is required."),
  tasklistId: z.string().min(1, "Task List is required."),
  taskName: z.string().min(1, "Task Name is required."),
  taskDescription: z.string().optional(),
  custom_fields: z.record(z.string(), z.any()).optional(),
});

type TaskFormValues = z.infer<typeof formSchema>;

interface TaskFormProps {
  socket: Socket | null;
  selectedProfileName: string;
  onSubmit: (data: any) => void;
  isProcessing: boolean;
}

export const TaskForm: React.FC<TaskFormProps> = ({
  socket,
  selectedProfileName,
  onSubmit,
  isProcessing,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingTaskLists, setIsLoadingTaskLists] = useState(false);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: "",
      tasklistId: "",
      taskName: "",
      taskDescription: "",
      custom_fields: {},
    },
  });

  const selectedProjectId = form.watch("projectId");

  // --- FIX: EFFECT 1 - ATTACH ALL LISTENERS ---
  useEffect(() => {
    if (!socket) return;

    const handleProjectsList = (data: any) => {
      if (data.success) {
        setProjects(data.projects || []);
      } else {
        toast({ title: "Error", description: `Failed to get projects: ${data.message}`, variant: "destructive" });
        setProjects([]);
      }
      setIsLoadingProjects(false);
    };

    const handleTasksList = (data: any) => {
      if (data.success) {
        setTaskLists(data.tasklist || []);
      } else {
        toast({ title: "Error", description: `Failed to get task lists: ${data.message}`, variant: "destructive" });
        setTaskLists([]);
      }
      setIsLoadingTaskLists(false);
    };

    socket.on('projectsList', handleProjectsList);
    socket.on('tasksList', handleTasksList);

    return () => {
      socket.off('projectsList', handleProjectsList);
      socket.off('tasksList', handleTasksList);
    };
  }, [socket]); // Only re-run if the socket itself changes

  // --- FIX: EFFECT 2 - FETCH PROJECTS ---
  useEffect(() => {
    if (socket && selectedProfileName) {
      setIsLoadingProjects(true);
      setProjects([]);
      setTaskLists([]);
      form.setValue("projectId", "");
      form.setValue("tasklistId", "");
      socket.emit('getProjectsProjects', { selectedProfileName });
    }
  }, [selectedProfileName, socket, form]); // Run when profile changes

  // --- FIX: EFFECT 3 - FETCH TASK LISTS ---
  useEffect(() => {
    if (socket && selectedProjectId) {
      setIsLoadingTaskLists(true);
      setTaskLists([]);
      form.setValue("tasklistId", "");
      socket.emit('getProjectsTasks', {
        selectedProfileName: selectedProfileName,
        projectId: selectedProjectId
      });
    } else {
      setTaskLists([]);
    }
  }, [selectedProjectId, selectedProfileName, socket, form]); // Run when project selection changes

  const onFormSubmit = (values: TaskFormValues) => {
    onSubmit(values);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Single Task</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoadingProjects || projects.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          isLoadingProjects 
                            ? "Loading projects..." 
                            : (projects.length > 0 ? "Select a project" : "No projects found")
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id_string} value={project.id_string}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tasklistId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task List</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoadingTaskLists || taskLists.length === 0 || !selectedProjectId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={
                          isLoadingTaskLists
                            ? "Loading task lists..."
                            : (selectedProjectId ? (taskLists.length > 0 ? "Select a task list" : "No task lists found") : "Select a project first")
                        } />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {taskLists.map((list) => (
                        <SelectItem key={list.id_string} value={list.id_string}>
                          {list.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
      name="taskName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="My New Task"
                      {...field}
                      disabled={isProcessing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taskDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional description..."
                      {...field}
                      rows={3}
                      disabled={isProcessing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? "Creating..." : "Create Task"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};