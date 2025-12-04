// --- FILE: src/pages/LiveStats.tsx ---
import React from 'react';
import { useNavigate } from 'react-router-dom'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
    Activity, CheckCircle2, AlertCircle, ExternalLink, 
    Ticket, Package, Cloud, Mail, Network, FileText, AppWindow, FolderKanban, Video 
} from 'lucide-react';
import { 
    Jobs, InvoiceJobs, CatalystJobs, EmailJobs, QntrlJobs, 
    PeopleJobs, CreatorJobs, ProjectsJobs, WebinarJobs 
} from '@/App';
import { formatTime } from '@/lib/utils';

interface LiveStatsProps {
    jobs: Jobs; // Desk
    invoiceJobs: InvoiceJobs;
    catalystJobs: CatalystJobs;
    emailJobs: EmailJobs;
    qntrlJobs: QntrlJobs;
    peopleJobs: PeopleJobs;
    creatorJobs: CreatorJobs;
    projectsJobs: ProjectsJobs;
    webinarJobs: WebinarJobs;
}

// Helper to determine status color
const getStatusColor = (isProcessing: boolean, isComplete: boolean, hasErrors: boolean) => {
    if (isProcessing) return "text-blue-500 animate-pulse";
    if (isComplete && hasErrors) return "text-orange-500";
    if (isComplete) return "text-green-500";
    return "text-muted-foreground";
};

const ServiceStatCard = ({ 
    title, 
    icon: Icon, 
    jobMap,
    route 
}: { 
    title: string, 
    icon: any, 
    jobMap: any,
    route: string 
}) => {
    const navigate = useNavigate(); 

    const activeProfiles = Object.entries(jobMap).filter(([_, job]: [string, any]) => 
        job.results?.length > 0 || job.isProcessing
    );

    if (activeProfiles.length === 0) {
        return (
            <Card className="opacity-60 border-dashed">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{title}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-xs text-muted-foreground italic">No active jobs</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium font-bold uppercase tracking-wider">{title}</CardTitle>
                <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                {activeProfiles.map(([profileName, job]: [string, any]) => {
                    const successCount = job.results.filter((r: any) => r.success).length;
                    const failCount = job.results.filter((r: any) => !r.success).length;
                    const totalProcessed = job.results.length;
                    const totalToProcess = job.totalToProcess || job.totalTicketsToProcess || 0;
                    const progress = totalToProcess > 0 ? (totalProcessed / totalToProcess) * 100 : 0;
                    
                    return (
                        <div key={profileName} className="space-y-2 border-b last:border-0 pb-3 last:pb-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {/* --- UPDATED: Pass targetProfile in state --- */}
                                    <Badge 
                                        variant="outline" 
                                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 group"
                                        onClick={() => navigate(route, { state: { targetProfile: profileName } })}
                                        title={`Go to ${title}`}
                                    >
                                        {profileName}
                                        <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                                    </Badge>
                                    {/* ------------------------------------------- */}
                                    {job.isPaused && <Badge variant="secondary" className="text-xs">Paused</Badge>}
                                </div>
                                {job.isProcessing ? (
                                    <span className="flex items-center text-xs text-blue-600 font-medium animate-pulse">
                                        <Activity className="h-3 w-3 mr-1" /> Running
                                    </span>
                                ) : job.isComplete ? (
                                    <span className="flex items-center text-xs text-green-600 font-medium">
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Idle</span>
                                )}
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Progress</span>
                                    <span>{totalProcessed} / {totalToProcess}</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-1">
                                <div className="flex flex-col items-center bg-green-50/50 dark:bg-green-900/10 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">Success</span>
                                    <span className="text-sm font-bold text-green-600">{successCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-red-50/50 dark:bg-red-900/10 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">Failed</span>
                                    <span className="text-sm font-bold text-red-600">{failCount}</span>
                                </div>
                                <div className="flex flex-col items-center bg-muted/50 p-1 rounded">
                                    <span className="text-[10px] text-muted-foreground uppercase">Time</span>
                                    <span className="text-xs font-mono font-medium mt-0.5">{formatTime(job.processingTime || 0)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
};

export const LiveStats: React.FC<LiveStatsProps> = (props) => {
    // Calculate global stats
    const allJobs = [
        props.jobs, props.invoiceJobs, props.catalystJobs, props.emailJobs, 
        props.qntrlJobs, props.peopleJobs, props.creatorJobs, props.projectsJobs, props.webinarJobs
    ];
    
    let activeJobCount = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    allJobs.forEach(jobMap => {
        Object.values(jobMap).forEach((job: any) => {
            if (job.isProcessing) activeJobCount++;
            if (job.results) {
                totalSuccess += job.results.filter((r: any) => r.success).length;
                totalErrors += job.results.filter((r: any) => !r.success).length;
            }
        });
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Live Statistics</h1>
                <p className="text-muted-foreground">Real-time monitoring of all active and completed jobs across your accounts.</p>
            </div>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
                        <Activity className={`h-4 w-4 ${activeJobCount > 0 ? 'text-blue-500 animate-spin' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeJobCount}</div>
                        <p className="text-xs text-muted-foreground">Currently processing</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Success</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalSuccess}</div>
                        <p className="text-xs text-muted-foreground">Records processed successfully</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalErrors}</div>
                        <p className="text-xs text-muted-foreground">Records failed</p>
                    </CardContent>
                </Card>
            </div>

            {/* Service Grids with Routes */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ServiceStatCard title="Zoho Desk" icon={Ticket} jobMap={props.jobs} route="/" />
                <ServiceStatCard title="Zoho Inventory" icon={Package} jobMap={props.invoiceJobs} route="/bulk-invoices" />
                <ServiceStatCard title="Catalyst Signup" icon={Cloud} jobMap={props.catalystJobs} route="/bulk-signup" />
                <ServiceStatCard title="Catalyst Email" icon={Mail} jobMap={props.emailJobs} route="/bulk-email" />
                <ServiceStatCard title="Zoho Qntrl" icon={Network} jobMap={props.qntrlJobs} route="/qntrl-forms" />
                <ServiceStatCard title="Zoho People" icon={FileText} jobMap={props.peopleJobs} route="/people-forms" />
                <ServiceStatCard title="Zoho Creator" icon={AppWindow} jobMap={props.creatorJobs} route="/creator-forms" />
                <ServiceStatCard title="Zoho Projects" icon={FolderKanban} jobMap={props.projectsJobs} route="/projects-tasks" />
                <ServiceStatCard title="Zoho Meeting" icon={Video} jobMap={props.webinarJobs} route="/bulk-webinar-registration" />
            </div>
        </div>
    );
};

export default LiveStats;