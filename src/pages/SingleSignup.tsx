import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Send, UserPlus, Loader2 } from 'lucide-react';
import { Profile } from '@/App';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface SingleSignupProps {
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";
let socket: Socket;

const SingleSignup: React.FC<SingleSignupProps> = ({ onAddProfile, onEditProfile, onDeleteProfile }) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...' });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Response state
  const [result, setResult] = useState<any>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const catalystProfiles = profiles.filter(p => p.catalyst?.projectId);
  const selectedProfile = catalystProfiles.find(p => p.profileName === activeProfileName) || null;

  useEffect(() => {
    if (catalystProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(catalystProfiles[0].profileName);
    }
  }, [catalystProfiles, activeProfileName]);

  useEffect(() => {
    socket = io(SERVER_URL);
    socket.on('connect', () => toast({ title: "Connected to server!" }));
    socket.on('apiStatusResult', (result) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    }));
    return () => {
      socket.disconnect();
    };
  }, [toast]);
  
  // --- REMOVED: useEffect for checkApiStatus (now handled by ProfileSelector) ---
  
  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
  };
  
  const handleManualVerify = () => {
    if (!activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    if (socket && socket.connected) {
      // --- MODIFICATION: Pass 'service' ---
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'catalyst' });
    }
    toast({ title: "Re-checking Connection..." });
  };

  const handleCreateUser = async () => {
    if (!activeProfileName || !email || !firstName || !lastName) {
      toast({ title: "Missing Information", description: "Please fill out all fields.", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    setResult(null);
    toast({ title: "Creating User...", description: "This may take a moment." });
    
    try {
      const response = await fetch(`${SERVER_URL}/api/catalyst/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          selectedProfileName: activeProfileName,
        }),
      });

      const data = await response.json();
      setResult(data);
      setIsResultModalOpen(true);
      toast({
          title: data.success ? "User Created Successfully" : "User Creation Failed",
          description: data.message || data.error,
          variant: data.success ? "default" : "destructive",
      });

    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : "An unknown network error occurred.";
      setResult({ success: false, error: errorMessage });
      setIsResultModalOpen(true);
      toast({ title: "Network Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <DashboardLayout
        onAddProfile={onAddProfile}
        profiles={catalystProfiles}
        selectedProfile={selectedProfile}
        jobs={{}}
        onProfileChange={handleProfileChange}
        apiStatus={apiStatus}
        onShowStatus={() => setIsStatusModalOpen(true)}
        onManualVerify={handleManualVerify}
        socket={socket}
        onEditProfile={onEditProfile}
        onDeleteProfile={onDeleteProfile}
        service="catalyst" // <-- ADD THIS PROP
      >
        <div className="space-y-8">
          <Card className="shadow-medium hover:shadow-large transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <span>Sign Up a Single User</span>
              </CardTitle>
              <CardDescription>Fill in the details below to add one user to Zoho Catalyst.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder="Rowena" value={firstName} onChange={e => setFirstName(e.target.value)} disabled={isProcessing} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder="Simmons" value={lastName} onChange={e => setLastName(e.target.value)} disabled={isProcessing} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="r.simmons@zylker.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isProcessing} />
                  </div>
                </div>
              </div>
              <Button onClick={handleCreateUser} size="lg" className="w-full" disabled={isProcessing}>
                {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating User...</> : <><Send className="mr-2 h-4 w-4" /> Create User</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
      
      <Dialog open={isResultModalOpen} onOpenChange={setIsResultModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Creation Result</DialogTitle>
            <DialogDescription>{result?.message || result?.error}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border">
              {JSON.stringify(result?.fullResponse, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SingleSignup;