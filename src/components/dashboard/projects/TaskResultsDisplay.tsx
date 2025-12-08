// --- FILE: src/components/dashboard/projects/TaskResultsDisplay.tsx (NEW) ---
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZohoProject, ZohoTask } from './ProjectsDataTypes';
import { Button } from '@/components/ui/button';
import { RefreshCw, ListFilter } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';

interface TaskResultsDisplayProps {
  tasks: ZohoTask[];
  projects: ZohoProject[];
  selectedProjectId: string | null;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  fetchTasks: () => void;
}

export const TaskResultsDisplay: React.FC<TaskResultsDisplayProps> = ({
  tasks,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  fetchTasks,
}) => {
  
  // DataTable Column Definitions
  const columns: ColumnDef<ZohoTask>[] = useMemo(() => [
    {
        accessorKey: 'prefix',
        header: 'Key',
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.prefix}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Task Name',
    },
    {
      accessorKey: 'status.name',
      header: 'Status',
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.status.name}</span>,
    },
    {
      accessorKey: 'tasklist.name',
      header: 'Task List',
    },
    {
      accessorKey: 'due_date',
      header: 'Due Date',
      cell: ({ row }) => (
        <span>{row.original.due_date ? format(new Date(row.original.due_date), 'MMM d, yyyy') : 'N/A'}</span>
      ),
    },
  ], []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center space-x-2">
            <ListFilter className="h-5 w-5 text-primary" />
            <span>Task List</span>
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Select 
            value={selectedProjectId || ''} 
            onValueChange={setSelectedProjectId}
            disabled={projects.length === 0}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Project to Filter" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchTasks} title="Refresh Tasks">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Please select a profile that has Zoho Projects configured and ensure projects exist in your portal.</p>
        ) : (
            <DataTable 
                columns={columns} 
                data={tasks} 
                filterColumnId="name" 
                filterPlaceholder="Filter by task name..."
            />
        )}
      </CardContent>
    </Card>
  );
};