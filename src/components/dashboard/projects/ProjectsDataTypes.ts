// --- FILE: src/components/dashboard/projects/ProjectsDataTypes.ts (NEW/MODIFIED) ---

import { ProjectsJobState, ProjectsJobs } from "@/App";

// --- Types inferred from your existing files ---
export type { ProjectsJobs, ProjectsJobState };

export interface ZohoProject {
  id: string;
  id_string: string;
  name: string;
  // Add other project properties as needed
}

export interface ZohoTask {
  id: string;
  id_string: string;
  name: string;
  tasklist: {
    id: string; // This is the ID we will auto-detect
    name: string;
  };
  // Add other task properties as needed
}

// --- NEW INTERFACE FOR TASK LISTS (Used for Single Task Form) ---
export interface ZohoTaskList {
  id: string;
  id_string: string;
  name: string;
}
// --- END NEW INTERFACE ---

// --- NEW INTERFACE FOR CUSTOM FIELDS ---
export interface ProjectCustomField {
  label_name: string;
  column_name: string; // This is the API key
  field_type: string; // 'Text', 'Numeric', 'Date', 'Picklist' etc.
  default_value?: any;
  is_mandatory: boolean;
  options?: { key: string, value: string }[]; // For picklist
}
// --- END NEW INTERFACE ---