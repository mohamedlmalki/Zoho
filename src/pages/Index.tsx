// --- FILE: src/pages/Index.tsx ---
import React, { useState } from 'react';
import { Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Settings, Trash2, Edit2, Users, FileText, Zap, Trello, Server, LayoutTemplate, Briefcase, Video, CreditCard } from "lucide-react"; 
import { Profile, JobState } from "@/App";
import { useNavigate } from "react-router-dom";
import { ProfileSelector } from "@/components/dashboard/ProfileSelector";

interface IndexProps {
  jobs: Record<string, JobState>;
  setJobs: React.Dispatch<React.SetStateAction<Record<string, JobState>>>;
  socket: Socket | null;
  createInitialJobState: () => JobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const Index = ({ 
    jobs, 
    setJobs, 
    socket, 
    createInitialJobState, 
    onAddProfile, 
    onEditProfile, 
    onDeleteProfile 
}: IndexProps) => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-8 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Zoho Bulk Automation
          </h1>
          <p className="text-muted-foreground">Manage your Zoho ecosystem with ease</p>
        </div>
        <Button onClick={onAddProfile} variant="premium" className="shadow-lg">
          <Plus className="mr-2 h-4 w-4" /> Add Profile
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Desk Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-blue-500" onClick={() => navigate('/single-ticket')}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 group-hover:text-blue-600 transition-colors">
              <FileText className="h-5 w-5" />
              <span>Desk Tickets</span>
            </CardTitle>
            <CardDescription>Create bulk tickets in Zoho Desk</CardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-sm text-muted-foreground">Automate ticket creation, email verification, and reply management.</p>
          </CardContent>
        </Card>

        {/* Inventory Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-green-500" onClick={() => navigate('/bulk-invoices')}>
          <CardHeader>
             <CardTitle className="flex items-center space-x-2 group-hover:text-green-600 transition-colors">
              <FileText className="h-5 w-5" />
              <span>Inventory Invoices</span>
            </CardTitle>
            <CardDescription>Send bulk invoices via Zoho Inventory</CardDescription>
          </CardHeader>
          <CardContent>
              <p className="text-sm text-muted-foreground">Manage invoices, organization details and bulk email sending.</p>
          </CardContent>
        </Card>

        {/* Catalyst Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-purple-500" onClick={() => navigate('/bulk-signup')}>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 group-hover:text-purple-600 transition-colors">
              <Zap className="h-5 w-5" />
              <span>Catalyst Users</span>
            </CardTitle>
            <CardDescription>Manage Zoho Catalyst users</CardDescription>
          </CardHeader>
          <CardContent>
              <p className="text-sm text-muted-foreground">Bulk signup users, manage permissions and send emails via Catalyst.</p>
          </CardContent>
        </Card>

        {/* Qntrl Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-orange-500" onClick={() => navigate('/qntrl-forms')}>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-orange-600 transition-colors">
                    <Trello className="h-5 w-5" />
                    <span>Qntrl Cards</span>
                </CardTitle>
                <CardDescription>Bulk create cards in Qntrl</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Fetch layouts and create cards in bulk for your orchestrations.</p>
            </CardContent>
        </Card>

        {/* People Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-pink-500" onClick={() => navigate('/people-forms')}>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-pink-600 transition-colors">
                    <Users className="h-5 w-5" />
                    <span>People Records</span>
                </CardTitle>
                <CardDescription>Insert bulk records in Zoho People</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Add employees or other form data directly into Zoho People.</p>
            </CardContent>
        </Card>

        {/* Creator Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-yellow-500" onClick={() => navigate('/creator-forms')}>
             <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-yellow-600 transition-colors">
                    <LayoutTemplate className="h-5 w-5" />
                    <span>Creator Records</span>
                </CardTitle>
                <CardDescription>Insert bulk records in Zoho Creator</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Push data to any Zoho Creator application form.</p>
            </CardContent>
        </Card>

        {/* Projects Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-indigo-500" onClick={() => navigate('/projects-tasks')}>
             <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-indigo-600 transition-colors">
                    <Briefcase className="h-5 w-5" />
                    <span>Projects Tasks</span>
                </CardTitle>
                <CardDescription>Create tasks in Zoho Projects</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Bulk task creation for any project and tasklist.</p>
            </CardContent>
        </Card>

        {/* Meeting Card */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-cyan-500" onClick={() => navigate('/bulk-webinar-registration')}>
             <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-cyan-600 transition-colors">
                    <Video className="h-5 w-5" />
                    <span>Webinar Registrations</span>
                </CardTitle>
                <CardDescription>Bulk register attendees</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Register users for Zoho Meeting webinars in bulk.</p>
            </CardContent>
        </Card>

        {/* Expense Card (NEW) */}
        <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-emerald-600" onClick={() => navigate('/bulk-expense')}>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-emerald-600 transition-colors">
                    <CreditCard className="h-5 w-5" />
                    <span>Bulk Expenses</span>
                </CardTitle>
                <CardDescription>Create records in Expense Custom Modules</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Smart bulk creation with dynamic field selection.</p>
            </CardContent>
        </Card>
        
        {/* Live Stats Card */}
         <Card className="hover:shadow-lg transition-all cursor-pointer group border-l-4 border-l-red-500 md:col-span-2 lg:col-span-3" onClick={() => navigate('/live-stats')}>
            <CardHeader>
                <CardTitle className="flex items-center space-x-2 group-hover:text-red-600 transition-colors">
                    <Server className="h-5 w-5" />
                    <span>Live Dashboard Stats</span>
                </CardTitle>
                <CardDescription>View real-time progress of all jobs</CardDescription>
            </CardHeader>
             <CardContent>
                <p className="text-sm text-muted-foreground">Monitor all active bulk operations in one place.</p>
            </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default Index;