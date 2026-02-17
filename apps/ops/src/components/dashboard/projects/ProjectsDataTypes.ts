// --- FILE: src/components/dashboard/projects/ProjectsDataTypes.ts (MODIFIED) ---

import { ProjectsJobState, ProjectsResult } from '@/App';
import { ColumnDef } from '@tanstack/react-table';

export interface ZohoProject {
    id: string;
    name: string;
    status: string;
    portal_id: string; // Needed for API calls
    // Add other fields as needed
}

// <--- NEW INTERFACE --->
export interface ZohoTaskList {
    id: string;
    name: string;
}
// <--- END NEW INTERFACE --->


export interface ZohoTask {
    id: string;
    name: string;
    prefix: string;
    tasklist: {
        id: string;
        name: string;
    };
    status: {
        id: string;
        name: string;
    };
    created_time: string;
    due_date: string;
    details?: string;
}

export interface ProjectsTasksFormData {
    emails: string; // For bulk processing/assigning
    projectId: string; // Selected Project ID
    tasklistId: string; // <--- NEW FIELD
    taskName: string;
    taskDescription: string;
    delay: number;
}

export interface TaskLogResult {
    projectName: string;
    success: boolean;
    details?: string;
    error?: string;
    fullResponse?: any;
}

export interface TaskProgressState {
    formData: ProjectsTasksFormData;
    results: TaskLogResult[];
    isProcessing: boolean;
    isPaused: boolean;
    isComplete: boolean;
    processingStartTime: Date | null;
    processingTime: number;
    totalToProcess: number;
    countdown: number;
    currentDelay: number;
    filterText: string;
}

// ... (other exports remain the same)
export { ProjectsJobState, ProjectsResult };