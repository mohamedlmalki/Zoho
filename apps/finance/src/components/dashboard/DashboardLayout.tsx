import React, { useContext } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom'; 
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Ticket, UserPlus, Package, BarChart3, Activity, Receipt, Book, Users, Banknote, Layers, Save, Download, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSelector } from './ProfileSelector';
import { Profile, InvoiceJobs, ExpenseJobs, CustomModuleJobs, ContactJobs, SaveLoadContext } from '@/App'; 
import { Socket } from 'socket.io-client';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

type AllJobs = InvoiceJobs | ExpenseJobs | CustomModuleJobs | ContactJobs | any;

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
  service?: 'inventory' | 'books' | 'billing' | 'expense';
}

// Helper for Sidebar Links
const SidebarNavLink = ({ to, children }: { to: string, children: React.ReactNode }) => (
  <NavLink 
    to={to} 
    className={({ isActive }) => cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:text-primary",
      isActive ? "bg-muted text-primary" : "text-muted-foreground"
    )}
  >
    {children}
  </NavLink>
);

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  stats,
  onAddProfile,
  profiles,
  selectedProfile,
  jobs,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onManualVerify,
  socket,
  onEditProfile,
  onDeleteProfile,
  service
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openSaveModal, openLoadModal } = useContext(SaveLoadContext); // Consume Context
  const isStatsPage = location.pathname === '/live-stats';

  // Calculate generic progress if stats provided
  const progressPercent = stats && stats.totalToProcess > 0 
    ? (stats.totalTickets / stats.totalToProcess) * 100 
    : 0;

  return (
    // --- CHANGED WIDTHS HERE ---
    <div className="grid min-h-screen w-full md:grid-cols-[250px_1fr] lg:grid-cols-[340px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          
          {/* Header/Logo */}
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <NavLink to="/" className="flex items-center gap-2 font-semibold">
              <Ticket className="h-6 w-6 text-primary" />
              <span className="">Zoho Bulk Tools</span>
            </NavLink>
          </div>

          {/* --- MOVED PROFILE SELECTOR HERE --- */}
          {!isStatsPage && (
            <div className="px-3 pt-3">
               <ProfileSelector 
                  profiles={profiles} 
                  selectedProfile={selectedProfile} 
                  onProfileChange={onProfileChange}
                  apiStatus={apiStatus}
                  onShowStatus={onShowStatus}
                  onManualVerify={onManualVerify}
                  socket={socket}
                  onEditProfile={onEditProfile}
                  onDeleteProfile={onDeleteProfile}
                  service={service}
                  jobs={jobs} 
                  onAddProfile={onAddProfile} 
                />
            </div>
          )}

          <div className="flex-1 overflow-auto py-2">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-6">
              
              {/* INVENTORY */}
              <div className="space-y-1">
                <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Zoho Inventory</h4>
                <SidebarNavLink to="/bulk-invoices">
                  <Package className="h-4 w-4" />
                  Bulk Invoices
                </SidebarNavLink>
                <SidebarNavLink to="/single-invoice">
                  <Ticket className="h-4 w-4" />
                  Single Invoice
                </SidebarNavLink>
                <SidebarNavLink to="/custom-modules">
                  <Database className="h-4 w-4" />
                  Custom Modules
                </SidebarNavLink>
                <SidebarNavLink to="/email-statics">
                  <BarChart3 className="h-4 w-4" />
                  Email Statistics
                </SidebarNavLink>
              </div>

              {/* BOOKS */}
              <div className="space-y-1">
                <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Zoho Books</h4>
                <SidebarNavLink to="/books-invoices">
                  <Book className="h-4 w-4" />
                  Bulk Invoices
                </SidebarNavLink>
                <SidebarNavLink to="/books-contacts">
                  <Users className="h-4 w-4" />
                  Bulk Contacts
                </SidebarNavLink>
                <SidebarNavLink to="/books-custom-modules">
                  <Layers className="h-4 w-4" />
                  Custom Modules
                </SidebarNavLink>
                <SidebarNavLink to="/books-email-statics">
                  <BarChart3 className="h-4 w-4" />
                  Email Statistics
                </SidebarNavLink>
              </div>

              {/* BILLING (NEW) */}
              <div className="space-y-1">
                <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Zoho Billing</h4>
                <SidebarNavLink to="/billing-contacts">
                  <Users className="h-4 w-4" />
                  Bulk Contacts
                </SidebarNavLink>
                <SidebarNavLink to="/billing-custom-modules">
                  <Layers className="h-4 w-4" />
                  Custom Modules
                </SidebarNavLink>
              </div>

              {/* EXPENSE */}
              <div className="space-y-1">
                <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Zoho Expense</h4>
                <SidebarNavLink to="/expense">
                  <Receipt className="h-4 w-4" />
                  Custom Module
                </SidebarNavLink>
              </div>
             
            </nav>
          </div>
          
          <div className="mt-auto p-4 border-t space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50" onClick={openSaveModal}>
                    <Save className="h-4 w-4 mr-2" /> Save
                </Button>
                <Button size="sm" variant="outline" className="w-full border-green-200 text-green-700 hover:bg-green-50" onClick={openLoadModal}>
                    <Download className="h-4 w-4 mr-2" /> Load
                </Button>
            </div>
            <Button size="sm" className="w-full" onClick={onAddProfile}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </div>
      </div>
     
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30 justify-between">
          
          <div className="flex-1">
            {/* Empty space where ProfileSelector used to be */}
          </div>
          
          <Button 
            variant={isStatsPage ? "default" : "outline"} 
            size="sm" 
            className="hidden md:flex items-center gap-2"
            onClick={() => navigate('/live-stats')}
          >
            <Activity className="h-4 w-4" />
            Live Statistics
          </Button>

          {stats && stats.isProcessing && stats.totalToProcess > 0 && (
            <div className="absolute bottom-0 left-0 w-full">
              <Progress value={progressPercent} className="h-1 w-full rounded-none bg-muted/50" />
            </div>
          )}
        </header>
        
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-x-hidden bg-muted/10">
          {children}
        </main>
      </div>
    </div>
  );
};