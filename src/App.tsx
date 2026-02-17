import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Banknote, ArrowRight, LayoutDashboard, Users } from "lucide-react";

// Simple Component for the Dashboard Card
const AppCard = ({ title, desc, icon: Icon, color, port, features }: any) => (
  <Card className="group hover:shadow-2xl transition-all duration-300 border-l-4 overflow-hidden" style={{ borderLeftColor: color }}>
    <CardHeader className="pb-4">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-xl bg-opacity-10 transition-colors`} style={{ backgroundColor: `${color}20` }}>
          <Icon size={32} style={{ color: color }} />
        </div>
        <Button variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => window.open(`http://localhost:${port}`, '_blank')}>
          Open App <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      <CardTitle className="text-2xl mt-4">{title}</CardTitle>
      <CardDescription className="text-md mt-1">{desc}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-3 mb-6">
        {features.map((feature: string, i: number) => (
          <div key={i} className="flex items-center">
            <div className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: color }} />
            {/* Styled as Bold and Black */}
            <span className="font-bold text-black text-sm">{feature}</span>
          </div>
        ))}
      </div>
      <Button 
        className="w-full mt-2 text-white shadow-md group-hover:translate-y-0 translate-y-2 transition-all opacity-90 hover:opacity-100"
        style={{ backgroundColor: color }}
        onClick={() => window.open(`http://localhost:${port}`, '_blank')}
      >
        Launch {title}
      </Button>
    </CardContent>
  </Card>
);

const App = () => {
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-8 font-sans">
      
      {/* Header Section */}
      <div className="text-center mb-12 space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-4">
          <LayoutDashboard className="h-8 w-8 text-slate-700" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Zoho Ecosystem</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Centralized control plane for your operational, financial, and CRM tools.
        </p>
      </div>

      {/* Grid of Apps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl w-full">
        
        {/* Ops App (Port 8080) */}
        <AppCard 
          title="Operations" 
          desc="Support & Projects"
          icon={Wrench} 
          color="#3b82f6" // Blue
          port={8080}
          features={[
            'Zoho Desk', 
            'Zoho Projects', 
            'Zoho Catalyst', 
            'Zoho People', 
            'Zoho Creator',
            'Zoho FSM',
            'Zoho Meeting',
            'Zoho Bookings',
            'Zoho Qntrl'
          ]}
        />

        {/* Finance App (Port 8092) */}
        <AppCard 
          title="Finance" 
          desc="Books & Inventory"
          icon={Banknote} 
          color="#22c55e" // Green
          port={8092}
          features={[
            'Zoho Inventory', 
            'Zoho Books', 
            'Zoho Billing', 
            'Zoho Expense'
          ]}
        />

        {/* CRM App (Port 5002) */}
        <AppCard 
          title="CRM Suite" 
          desc="Sales & Contacts"
          icon={Users} 
          color="#f59e0b" // Amber/Orange
          port={5002}
          features={[
            'Zoho CRM', 
            'Zoho Bigin'
          ]}
        />

      </div>

      <div className="mt-12 text-sm text-slate-400">
        System Status: <span className="text-green-600 font-medium">● Online</span>
      </div>
    </div>
  );
};

export default App;