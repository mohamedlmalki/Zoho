import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, Loader2, Users, Search } from 'lucide-react';
import { Profile } from '@/App';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface CatalystUser {
    user_id: string; 
    first_name: string;
    last_name: string;
    email_id: string;
    created_time: string;
    is_confirmed: boolean;
    status: string;
}

interface CatalystUsersProps {
  socket: Socket | null;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

const CatalystUsers: React.FC<CatalystUsersProps> = ({ socket, onAddProfile, onEditProfile, onDeleteProfile }) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...' });
  const [users, setUsers] = useState<CatalystUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [filterText, setFilterText] = useState('');

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

  const filteredUsers = useMemo(() => {
    if (!filterText) return users;
    return users.filter(user =>
      user.first_name.toLowerCase().includes(filterText.toLowerCase()) ||
      user.last_name.toLowerCase().includes(filterText.toLowerCase()) ||
      user.email_id.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [users, filterText]);

  const fetchUsers = useCallback(() => {
    if (activeProfileName && socket?.connected) {
      setIsLoading(true);
      socket.emit('getUsers', { 
          selectedProfileName: activeProfileName, 
          page: 1,
          per_page: 200,
        });
    }
  }, [activeProfileName, socket]);
  
  const checkApiStatus = useCallback(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      // --- MODIFICATION: Pass 'service' ---
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'catalyst' });
    }
  }, [activeProfileName, socket]);

  useEffect(() => {
    if (!socket) return;

    socket.on('apiStatusResult', (result) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    }));
    
    socket.on('usersResult', (data) => {
      setIsLoading(false);
      if (data.success) {
        setUsers(data.users);
      } else {
        toast({ title: "Error fetching users", description: data.error, variant: "destructive" });
      }
    });

    socket.on('userDeletedResult', (data) => {
        if (data.success) {
            toast({ title: "User Deleted", description: `User ${data.data.email_id} has been deleted.` });
            fetchUsers();
        } else {
            toast({ title: "Error Deleting User", description: data.error, variant: "destructive" });
        }
    });

    socket.on('userDeleteProgress', (progress) => {
        setDeleteProgress(progress.deletedCount / progress.total * 100);
    });

    socket.on('usersDeletedResult', (data) => {
        setIsDeleting(false);
        setDeleteProgress(0);
        setSelectedUsers([]);
        if (data.success) {
            toast({ title: "Users Deleted", description: `${data.deletedCount} users have been deleted.` });
            fetchUsers();
        } else {
            toast({ title: "Error Deleting Users", description: data.error, variant: "destructive" });
        }
    });

    return () => {
      socket.off('apiStatusResult');
      socket.off('usersResult');
      socket.off('userDeletedResult');
      socket.off('userDeleteProgress');
      socket.off('usersDeletedResult');
    };
  }, [socket, toast, fetchUsers]);

  // --- MODIFICATION: Call checkApiStatus from here ---
  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      checkApiStatus();
      fetchUsers();
    }
  }, [activeProfileName, socket?.connected, checkApiStatus, fetchUsers]);
  // --- END MODIFICATION ---
  
  useEffect(() => {
    if (catalystProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(catalystProfiles[0].profileName);
    }
  }, [catalystProfiles, activeProfileName]);

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
  };

  const handleManualVerify = () => {
    if (activeProfileName && socket?.connected) {
        toast({ title: "Re-checking Connection..." });
        checkApiStatus(); // This now correctly calls the function with 'catalyst'
    }
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(u => u.user_id));
    }
  };

  const handleDelete = () => {
    if (selectedUsers.length > 0 && socket?.connected) {
        setShowDeleteConfirm(false);
        setIsDeleting(true);
        socket.emit('deleteUsers', { selectedProfileName: activeProfileName, userIds: selectedUsers });
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
            <Card>
              <CardHeader>
                <CardTitle>Catalyst Users</CardTitle>
                <CardDescription>Manage users in your Catalyst project.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between mb-4">
                  <div className="flex gap-2">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filter by name or email..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button onClick={() => setShowDeleteConfirm(true)} disabled={selectedUsers.length === 0} variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete ({selectedUsers.length})
                    </Button>
                  </div>
                  <Button onClick={fetchUsers} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                  </Button>
                </div>
                 {isDeleting && (
                    <div className="my-4">
                        <Progress value={deleteProgress} className="w-full" />
                        <p className="text-sm text-center mt-2 text-muted-foreground">Deleting {selectedUsers.length} users...</p>
                    </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confirmed</TableHead>
                      <TableHead>Created Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell colSpan={6} className="text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                </TableCell>
                            </TableRow>
                        ))
                    ) : filteredUsers.map(user => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUsers.includes(user.user_id)}
                            onCheckedChange={() => handleSelectUser(user.user_id)}
                          />
                        </TableCell>
                        <TableCell>{user.first_name} {user.last_name}</TableCell>
                        <TableCell>{user.email_id}</TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'ACTIVE' ? 'success' : 'secondary'}>{user.status}</Badge>
                        </TableCell>
                        <TableCell>{user.is_confirmed ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{user.created_time}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </DashboardLayout>
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete {selectedUsers.length} user(s). This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </>
  );
};

export default CatalystUsers;