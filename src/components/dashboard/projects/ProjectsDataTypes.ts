// In src/components/dashboard/projects/ProjectsDataTypes.ts

export interface Project {
  id: string;
  id_string: string;
  name: string;
  // Add other project fields if needed
}

export interface TaskList {
  id: string;
  id_string: string;
  name: string;
  // Add other tasklist fields if needed
}

export interface ProjectsProjectsResult {
  success: boolean;
  projects?: Project[];
  error?: string;
}

export interface ProjectsTasksResult {
  success: boolean;
  tasklists?: TaskList[];
  error?: string;
}