// --- FILE: src/components/dashboard/DashboardLayout.tsx (MODIFIED) ---
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
// --- ADDED THIS IMPORT ---
import { Ticket, UserPlus, Package, BarChart3, Cloud, Users, Mail, Network, UserSquare, FileText, AppWindow, FolderKanban } from 'lucide-react';
// --- END ---
import { cn } from '@/lib/utils';
import { ProfileSelector } from './ProfileSelector';
// NOTE: ProjectsJobs imported from '@/App' is used here, assuming you correctly merged the previous App.tsx changes
import { Profile, Jobs, InvoiceJobs, CatalystJobs, EmailJobs, QntrlJobs, PeopleJobs, CreatorJobs, ProjectsJobs } from '@/App';
import { Socket } from 'socket.io-client';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

// --- ADDED ProjectsJobs to the type ---
type AllJobs = Jobs | InvoiceJobs | CatalystJobs | EmailJobs | QntrlJobs | PeopleJobs | CreatorJobs | ProjectsJobs;
// --- ADDED 'projects' to the type ---
type ServiceType = 'desk' | 'inventory' | 'catalyst' | 'qntrl' | 'people' | 'creator' | 'projects';


interface DashboardLayoutProps {
  children: React.ReactNode;
  stats?: {
    totalTickets: number;
    totalToProcess: number;
    isProcessing: boolean;
  };
  onAddProfile: () => void;
  profiles: Profile[];
  selectedProfile: Profile | null;
  jobs: AllJobs;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onManualVerify: () => void;
  socket: Socket | null;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
  service?: ServiceType;
}

const SidebarNavLink = ({ to, children }: { to: string, children: React.ReactNode }) => (
    <NavLink
      to={to}
      end 
      className={({ isActive }) => cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
        isActive && "text-primary bg-primary/10"
      )}
    >
      {children}
    </NavLink>
);

// --- New Component for a clean divider ---
const SidebarDivider = () => (
  <div className="px-4 py-2">
    <div className="border-t border-muted/50" />
  </div>
);


export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  stats = { totalTickets: 0, totalToProcess: 0, isProcessing: false },
  onAddProfile,
  service, 
  ...profileSelectorProps 
}) => {
  const progressPercent = stats.totalToProcess > 0 ? (stats.totalTickets / stats.totalToProcess) * 100 : 0;

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-card md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <div className="flex items-center gap-2 font-semibold">
              <div className="p-2 bg-gradient-primary rounded-lg shadow-glow">
                  <Ticket className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="">Zoho Blaster</span>
            </div>
          </div>

          <div className="p-4 border-b">
              <ProfileSelector {...profileSelectorProps} service={service} />
          </div>

          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-4">
              {/* ... (Other sections) ... */}
              <div>
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Zoho Desk</h3>
                <SidebarNavLink to="/">
                  <Ticket className="h-4 w-4" />
                  Bulk Tickets
                </SidebarNavLink>
                <SidebarNavLink to="/single-ticket">
                  <Ticket className="h-4 w-4" />
                  Single Ticket
                </SidebarNavLink>
              </div>
              <div>
                {/* --- Better Divider --- */}
                <SidebarDivider />
                
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Zoho Inventory</h3>
                <SidebarNavLink to="/bulk-invoices">
                  <Package className="h-4 w-4" />
                  Bulk Invoices
                </SidebarNavLink>
                <SidebarNavLink to="/single-invoice">
                  <Package className="h-4 w-4" />
                  Single Invoice
                </SidebarNavLink>
                <SidebarNavLink to="/email-statics">
                  <BarChart3 className="h-4 w-4" />
                  Email Statics
                </SidebarNavLink>
              </div>
              <div>
                {/* --- Better Divider --- */}
                <SidebarDivider />

                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Zoho Catalyst</h3>
                <SidebarNavLink to="/bulk-signup">
                  <Cloud className="h-4 w-4" />
                  Bulk Signup
                </SidebarNavLink>
                <SidebarNavLink to="/bulk-email">
                  <Mail className="h-4 w-4" />
                  Bulk Email
                </SidebarNavLink>
                <SidebarNavLink to="/single-signup">
                  <Cloud className="h-4 w-4" />
                  Single Signup
                </SidebarNavLink>
                <SidebarNavLink to="/catalyst-users">
                  <Users className="h-4 w-4" />
                  Manage Users
                </SidebarNavLink>
              </div>
              <div>
                {/* --- Better Divider --- */}
                <SidebarDivider />
                
                {/* --- Heading first --- */}
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Zoho Qntrl</h3>
                
                {/* --- Better Note Style --- */}
                <p className="px-3 text-[11px] font-normal text-muted-foreground/90 italic mb-2">
                    no from name - subject and content
                </p>
                
                <SidebarNavLink to="/qntrl-forms">
                  <Network className="h-4 w-4" />
                  Forms
                </SidebarNavLink>
              </div>
              <div>
                {/* --- Better Divider --- */}
                <SidebarDivider />

                {/* --- Heading first --- */}
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Zoho People</h3>

                {/* --- Better Note Style --- */}
                <p className="px-3 text-[11px] font-normal text-muted-foreground/90 italic mb-2">
                    no from name - subject
                </p>

                <SidebarNavLink to="/people-forms">
                  <FileText className="h-4 w-4" />
                  Forms
                </SidebarNavLink>
              </div>

              <div>
                {/* --- Better Divider --- */}
                <SidebarDivider />

                {/* --- Heading first --- */}
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Zoho Creator</h3>

                {/* --- Better Note Style --- */}
                <p className="px-3 text-[11px] font-normal text-muted-foreground/90 italic mb-2">
                    no from name - subject and content
                </p>

                <SidebarNavLink to="/creator-forms">
                  <AppWindow className="h-4 w-4" />
                  Forms
                </SidebarNavLink>
              </div>
              
              {/* --- UPDATED PROJECTS BLOCK --- */}
              <div>
                <SidebarDivider />
                <h3 className="px-3 text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Zoho Projects</h3>
                <p className="px-3 text-[11px] font-normal text-muted-foreground/90 italic mb-2">
                    Task creation and management
                </p>
                <SidebarNavLink to="/projects-tasks">
                  <FolderKanban className="h-4 w-4" />
                  Task Management
                </SidebarNavLink>
              </div>
              {/* --- END OF UPDATED BLOCK --- */}
              
            </nav>
          </div>
          <div className="mt-auto p-4 border-t">
            <Button size="sm" className="w-full" onClick={onAddProfile}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30">
          <div className="w-full flex-1">
          </div>
          {stats.isProcessing && stats.totalToProcess > 0 && (
            <div className="absolute bottom-0 left-0 w-full">
              <Progress value={progressPercent} className="h-1 w-full rounded-none bg-muted/50" />
            </div>
          )}
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};