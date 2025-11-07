// --- FILE: src/components/dashboard/projects/TaskBulkForm.tsx (FIXED) ---
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProjectsJobState, ZohoProject } from './ProjectsDataTypes';
import { Loader2, Play, Pause, Square } from 'lucide-react';
import { Socket } from 'socket.io-client';
// --- REMOVED date-fns import, we will use jobState.processingTime ---

interface TaskBulkFormProps {
  selectedProfileName: string | null;
  projects: ZohoProject[];
  socket: Socket | null;
  jobState: ProjectsJobState;
  setJobs: React.Dispatch<React.SetStateAction<any>>;
  autoTaskListId: string | null;
}

// --- NEW JobSummary component (small, as requested) ---
const JobSummary: React.FC<{ jobState: ProjectsJobState }> = ({ jobState }) => {
    const { 
        results,
        processingTime, // <-- Using the timer from the hook
        isProcessing, 
        isComplete 
    } = jobState;
    
    // Don't show if job hasn't started
    if (!isProcessing && !isComplete) {
        return null;
    }

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;
    
    // This uses the pausable timer, starting from 0, as you requested
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
// --- END NEW COMPONENT ---


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
  const [taskDescription, setTaskDescription] = useState('');
  const [delay, setDelay] = useState(1);
  const isProcessing = jobState.isProcessing;

  useEffect(() => {
    if (projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

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

    setJobs((prevJobs: any) => ({
      ...prevJobs,
      [selectedProfileName]: {
        ...jobState,
        formData: { taskNames, projectId, tasklistId: autoTaskListId, taskDescription, delay, displayName: selectedProfileName },
        totalToProcess: taskNames.length,
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        processingTime: 0, // <-- Reset timer to 0
        results: [],
        currentDelay: delay,
      },
    }));

    socket.emit('startBulkCreateTasks', {
        selectedProfileName,
        taskNames,
        projectId,
        tasklistId: autoTaskListId,
        taskDescription,
        delay,
    });
    
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

  const isPaused = jobState.isPaused;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Create Zoho Project Tasks</CardTitle>
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
          
          <div className="grid gap-2">
            <Label htmlFor="taskDescription">Default Description (Optional)</Label>
            <Textarea
              id="taskDescription"
              placeholder="Enter a description for all tasks"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          
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

          {/* --- THIS IS THE FIX: Added summary here --- */}
          <JobSummary jobState={jobState} />
          {/* --- END OF FIX --- */}
          
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