// --- FILE: src/components/dashboard/projects/TaskResultsDisplay.tsx ---
import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZohoProject, ZohoTask } from './ProjectsDataTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    RefreshCw, ListFilter, Search, ChevronLeft, ChevronRight, 
    ChevronsLeft, ChevronsRight, CheckCircle2, Circle, Clock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface TaskResultsDisplayProps {
  tasks: ZohoTask[];
  projects: ZohoProject[];
  selectedProjectId: string | null;
  setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  fetchTasks: () => void;
}

const ITEMS_PER_PAGE = 100;

export const TaskResultsDisplay: React.FC<TaskResultsDisplayProps> = ({
  tasks,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  fetchTasks,
}) => {
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // --- Filter Logic ---
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    
    return tasks.filter(task => {
      if (!filterText) return true;
      const lowerFilter = filterText.toLowerCase();
      return (
        (task.name || '').toLowerCase().includes(lowerFilter) ||
        (task.prefix || '').toLowerCase().includes(lowerFilter) ||
        (task.status?.name || '').toLowerCase().includes(lowerFilter) ||
        (task.tasklist?.name || '').toLowerCase().includes(lowerFilter)
      );
    });
  }, [tasks, filterText]);

  // --- Pagination Logic ---
  const totalPages = Math.ceil(filteredTasks.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, selectedProjectId]);

  const currentTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTasks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTasks, currentPage]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center space-x-2">
            <ListFilter className="h-5 w-5 text-primary" />
            <span>Task List ({filteredTasks.length})</span>
        </CardTitle>
        <div className="flex items-center space-x-2">
           <div className="relative w-[250px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter tasks..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-8"
              />
           </div>
          <Select 
            value={selectedProjectId || ''} 
            onValueChange={setSelectedProjectId}
            disabled={projects.length === 0}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Project" />
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
            <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20">
                <p className="text-muted-foreground">Please select a profile that has Zoho Projects configured.</p>
            </div>
        ) : filteredTasks.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20">
                <p className="text-muted-foreground">No tasks found matching your filters.</p>
            </div>
        ) : (
            <div className="flex flex-col space-y-4">
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Key</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Task Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-32">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Task List</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-32">Due Date</th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-border">
                                {currentTasks.map((task) => (
                                    <tr key={task.id} className="transition-colors hover:bg-muted/30">
                                        <td className="px-4 py-2">
                                            <Badge variant="outline" className="font-mono text-xs">{task.prefix || '#'}</Badge>
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium text-foreground">
                                            {task.name}
                                        </td>
                                        <td className="px-4 py-2">
                                            <Badge 
                                              variant="secondary" 
                                              className={`text-xs ${
                                                task.status.name === 'Closed' ? 'bg-green-100 text-green-800 hover:bg-green-100' : 
                                                task.status.name === 'Open' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : ''
                                              }`}
                                            >
                                                {task.status.name === 'Closed' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : 
                                                 task.status.name === 'Open' ? <Circle className="h-3 w-3 mr-1" /> : 
                                                 <Clock className="h-3 w-3 mr-1" />}
                                                {task.status.name}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2 text-sm text-muted-foreground">
                                            {task.tasklist.name}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-right font-mono text-muted-foreground">
                                            {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-2">
                        <div className="text-xs text-muted-foreground">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredTasks.length)} of {filteredTasks.length} tasks
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center justify-center text-sm font-medium w-[80px]">
                                Page {currentPage} / {totalPages}
                            </div>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )}
      </CardContent>
    </Card>
  );
};