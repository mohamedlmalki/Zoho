import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Profile } from '@/App';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Loader2, Building, Receipt, Book, Banknote, Package } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profileData: Profile, originalProfileName?: string) => void;
  profile: Profile | null;
  socket: Socket | null;
}

const SERVER_URL = "http://localhost:3009";

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, profile, socket }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Profile>({
    profileName: '',
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    inventory: { orgId: '', customModuleApiName: '', note: '' },
    books: { orgId: '', customModuleApiName: '', note: '' },
    billing: { orgId: '', customModuleApiName: '', note: '' },
    expense: { orgId: '', customModuleApiName: '', note: '' }
  });
  const [activeTab, setActiveTab] = useState('inventory');

  useEffect(() => {
    if (profile) {
      setFormData({
        profileName: profile.profileName || '',
        clientId: profile.clientId || '',
        clientSecret: profile.clientSecret || '',
        refreshToken: profile.refreshToken || '',
        inventory: { 
            orgId: profile.inventory?.orgId || '', 
            customModuleApiName: profile.inventory?.customModuleApiName || '',
            note: profile.inventory?.note || ''
        },
        books: { 
            orgId: profile.books?.orgId || '', 
            customModuleApiName: profile.books?.customModuleApiName || '',
            note: profile.books?.note || ''
        },
        billing: { 
            orgId: profile.billing?.orgId || '', 
            customModuleApiName: profile.billing?.customModuleApiName || '',
            note: profile.billing?.note || ''
        },
        expense: { 
            orgId: profile.expense?.orgId || '', 
            customModuleApiName: profile.expense?.customModuleApiName || '',
            note: profile.expense?.note || ''
        }
      });
    } else {
      setFormData({
        profileName: '', clientId: '', clientSecret: '', refreshToken: '',
        inventory: { orgId: '', customModuleApiName: '', note: '' },
        books: { orgId: '', customModuleApiName: '', note: '' },
        billing: { orgId: '', customModuleApiName: '', note: '' },
        expense: { orgId: '', customModuleApiName: '', note: '' }
      });
    }
    setActiveTab('inventory');
  }, [profile, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.profileName || !formData.clientId || !formData.clientSecret || !formData.refreshToken) {
      toast({ title: "Error", description: "All Core Credentials are required.", variant: "destructive" });
      return;
    }
    onSave(formData, profile?.profileName);
  };

  const handleAuthorize = async () => {
    if (!formData.clientId || !formData.clientSecret || !socket) return toast({ title: "Error", description: "Enter Client ID and Secret first.", variant: "destructive" });
    try {
        const response = await fetch(`${SERVER_URL}/api/zoho/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: formData.clientId, clientSecret: formData.clientSecret, socketId: socket.id }),
        });
        const data = await response.json();
        if (data.authUrl) {
            window.open(data.authUrl, '_blank', 'width=600,height=700');
            toast({ title: "Auth Started", description: "Please approve in the popup." });
        }
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  useEffect(() => {
      if(!socket) return;
      const handleToken = (data: { refreshToken: string }) => {
          setFormData(prev => ({ ...prev, refreshToken: data.refreshToken }));
          toast({ title: "Authorized!", description: "Refresh Token captured." });
      };
      socket.on('zoho-refresh-token', handleToken);
      return () => { socket.off('zoho-refresh-token', handleToken); };
  }, [socket, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile ? 'Edit Profile' : 'Add New Profile'}</DialogTitle>
          <DialogDescription>Configure Zoho API credentials.</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <form id="profile-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* CORE CREDENTIALS */}
            <div className="p-4 border rounded-md bg-muted/20 space-y-3">
                <div className="flex items-center gap-2 mb-2"><KeyRound className="h-4 w-4 text-primary"/><h3 className="font-semibold text-sm">Core Credentials</h3></div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label>Profile Name</Label>
                        <Input value={formData.profileName} onChange={e => setFormData({ ...formData, profileName: e.target.value })} placeholder="e.g. My Company" disabled={!!profile} />
                    </div>
                    <div className="grid gap-2">
                        <Label>Client ID</Label>
                        <Input value={formData.clientId} onChange={e => setFormData({ ...formData, clientId: e.target.value })} placeholder="Zoho Client ID" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label>Client Secret</Label>
                        {/* CHANGED: Removed type="password" */}
                        <Input value={formData.clientSecret} onChange={e => setFormData({ ...formData, clientSecret: e.target.value })} placeholder="Zoho Client Secret" />
                    </div>
                    <div className="grid gap-2">
                        <Label>Refresh Token</Label>
                        <div className="flex gap-2">
                            <Input value={formData.refreshToken} onChange={e => setFormData({ ...formData, refreshToken: e.target.value })} placeholder="Click 'Get Token'" />
                            <Button type="button" size="sm" variant="secondary" onClick={handleAuthorize} disabled={!formData.clientId || !formData.clientSecret}>Get Token</Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* PRODUCT TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="inventory" className="flex items-center gap-2"><Package className="h-4 w-4"/>Inventory</TabsTrigger>
                <TabsTrigger value="books" className="flex items-center gap-2"><Book className="h-4 w-4"/>Books</TabsTrigger>
                <TabsTrigger value="billing" className="flex items-center gap-2"><Banknote className="h-4 w-4"/>Billing</TabsTrigger>
                <TabsTrigger value="expense" className="flex items-center gap-2"><Receipt className="h-4 w-4"/>Expense</TabsTrigger>
              </TabsList>

              {/* INVENTORY TAB */}
              <TabsContent value="inventory" className="space-y-4 border p-4 rounded-md mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Inventory Organization ID</Label>
                    <Input 
                      value={formData.inventory?.orgId || ''} 
                      onChange={e => setFormData({ ...formData, inventory: { ...formData.inventory!, orgId: e.target.value } })} 
                      placeholder="e.g. 123456789" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Inv. Custom Module API Name</Label>
                    <Input 
                      value={formData.inventory?.customModuleApiName || ''} 
                      onChange={e => setFormData({ ...formData, inventory: { ...formData.inventory!, customModuleApiName: e.target.value } })} 
                      placeholder="e.g. cm_test" 
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                    <Label>Inventory Note</Label>
                    <Textarea 
                      value={formData.inventory?.note || ''} 
                      onChange={e => setFormData({ ...formData, inventory: { ...formData.inventory!, note: e.target.value } })} 
                      placeholder="Optional notes..." 
                      className="min-h-[60px]"
                    />
                </div>
              </TabsContent>

              {/* BOOKS TAB */}
              <TabsContent value="books" className="space-y-4 border p-4 rounded-md mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Books Organization ID</Label>
                    <Input 
                      value={formData.books?.orgId || ''} 
                      onChange={e => setFormData({ ...formData, books: { ...formData.books!, orgId: e.target.value } })} 
                      placeholder="e.g. 987654321" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Books Module API Name</Label>
                    <Input 
                      value={formData.books?.customModuleApiName || ''} 
                      onChange={e => setFormData({ ...formData, books: { ...formData.books!, customModuleApiName: e.target.value } })} 
                      placeholder="e.g. cm_books_test" 
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                    <Label>Books Note</Label>
                    <Textarea 
                      value={formData.books?.note || ''} 
                      onChange={e => setFormData({ ...formData, books: { ...formData.books!, note: e.target.value } })} 
                      placeholder="Optional notes..." 
                      className="min-h-[60px]"
                    />
                </div>
              </TabsContent>

              {/* BILLING TAB (NEW) */}
              <TabsContent value="billing" className="space-y-4 border p-4 rounded-md mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Billing Organization ID</Label>
                    <Input 
                      value={formData.billing?.orgId || ''} 
                      onChange={e => setFormData({ ...formData, billing: { ...formData.billing!, orgId: e.target.value } })} 
                      placeholder="e.g. 555666777" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Billing Module API Name</Label>
                    <Input 
                      value={formData.billing?.customModuleApiName || ''} 
                      onChange={e => setFormData({ ...formData, billing: { ...formData.billing!, customModuleApiName: e.target.value } })} 
                      placeholder="e.g. cm_billing_test" 
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                    <Label>Billing Note</Label>
                    <Textarea 
                      value={formData.billing?.note || ''} 
                      onChange={e => setFormData({ ...formData, billing: { ...formData.billing!, note: e.target.value } })} 
                      placeholder="Optional notes for Billing..." 
                      className="min-h-[60px]"
                    />
                </div>
              </TabsContent>

              {/* EXPENSE TAB */}
              <TabsContent value="expense" className="space-y-4 border p-4 rounded-md mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Expense Organization ID</Label>
                    <Input 
                      value={formData.expense?.orgId || ''} 
                      onChange={e => setFormData({ ...formData, expense: { ...formData.expense!, orgId: e.target.value } })} 
                      placeholder="e.g. 112233445" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Expense Module API Name</Label>
                    <Input 
                      value={formData.expense?.customModuleApiName || ''} 
                      onChange={e => setFormData({ ...formData, expense: { ...formData.expense!, customModuleApiName: e.target.value } })} 
                      placeholder="e.g. trip_requests" 
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                    <Label>Expense Note</Label>
                    <Textarea 
                      value={formData.expense?.note || ''} 
                      onChange={e => setFormData({ ...formData, expense: { ...formData.expense!, note: e.target.value } })} 
                      placeholder="Optional notes for Expense..." 
                      className="min-h-[60px]"
                    />
                </div>
              </TabsContent>

            </Tabs>
            
            <div className="h-4"></div>

          </form>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="profile-form">Save Profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};