import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-accounts";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Search, Filter, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge"; // Added Import
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export default function ContactManager() {
  const { data: accounts = [] } = useAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // --- FILTER: CRM ACCOUNTS ONLY ---
  const validAccounts = useMemo(() => accounts.filter((acc: any) => acc.supports_crm !== false), [accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  
  // Progress States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState("");

  useEffect(() => {
    if (validAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(validAccounts[0].id.toString());
    }
  }, [validAccounts, selectedAccountId]);

  const { data: contacts = [], isLoading: isLoadingContacts, refetch: refetchContacts } = useQuery({
    queryKey: ['/api/zoho/contacts', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['/api/zoho/users', selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const filteredContacts = useMemo(() => {
    if (!Array.isArray(contacts)) return [];
    return contacts.filter((contact: any) => {
      const matchesSearch = 
        (contact.Full_Name?.toLowerCase().includes(filterText.toLowerCase()) || 
         contact.Last_Name?.toLowerCase().includes(filterText.toLowerCase()) || 
         contact.Email?.toLowerCase().includes(filterText.toLowerCase()));
      
      const matchesUser = selectedUserId === 'all' || contact.Owner?.id === selectedUserId;
      
      return matchesSearch && matchesUser;
    });
  }, [contacts, filterText, selectedUserId]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(new Set(filteredContacts.map((c: any) => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedContacts);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedContacts(newSet);
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return;

    setIsDeleting(true);
    setDeleteProgress(0);
    setDeleteStatus("Initializing...");

    const idsToDelete = Array.from(selectedContacts);
    const BATCH_SIZE = 50; // CRM safe chunk size
    const total = idsToDelete.length;
    let processed = 0;

    try {
        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = idsToDelete.slice(i, i + BATCH_SIZE);
            setDeleteStatus(`Deleting contacts ${i + 1} to ${Math.min(i + BATCH_SIZE, total)} of ${total}...`);
            
            await apiRequest('DELETE', `/api/zoho/contacts/${selectedAccountId}`, { ids: batch });
            
            processed += batch.length;
            setDeleteProgress((processed / total) * 100);
        }

        toast({ title: "Success", description: `Deleted ${total} contacts successfully.` });
        setSelectedContacts(new Set());
        refetchContacts();
        setIsDeleteDialogOpen(false);
    } catch (error: any) {
        toast({ title: "Error", description: "Failed to delete some contacts.", variant: "destructive" });
    } finally {
        setIsDeleting(false);
        setDeleteProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="form-card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold">CRM Contact Manager</h3>
            {/* ADDED TOTAL COUNTER */}
            <Badge variant="secondary" className="text-sm font-normal">
                Total: {Array.isArray(contacts) ? contacts.length : 0}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex flex-col space-y-1">
                <Label className="text-xs">Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select Account" /></SelectTrigger>
                    <SelectContent>
                        {validAccounts.map((acc: any) => (
                            <SelectItem key={acc.id} value={acc.id.toString()}>{acc.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             </div>
             <Button variant="outline" size="icon" className="mt-5" onClick={() => refetchContacts()} disabled={isLoadingContacts || !selectedAccountId}>
                <RefreshCw className={`h-4 w-4 ${isLoadingContacts ? 'animate-spin' : ''}`} />
             </Button>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search contacts..." className="pl-8" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </div>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-[200px]"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Filter by Owner" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Owners</SelectItem>
                    {Array.isArray(users) && users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>{user.full_name || user.last_name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {selectedContacts.size > 0 && (
                <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => !isDeleting && setIsDeleteDialogOpen(open)}>
                    <DialogTrigger asChild>
                        <Button variant="destructive"><Trash2 className="w-4 h-4 mr-2" />Delete ({selectedContacts.size})</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete Contacts</DialogTitle>
                            <DialogDescription>
                                {isDeleting 
                                    ? "Please wait while we delete the selected contacts from CRM..."
                                    : `Are you sure you want to delete ${selectedContacts.size} contacts? This cannot be undone.`
                                }
                            </DialogDescription>
                        </DialogHeader>
                        
                        {isDeleting ? (
                            <div className="py-4 space-y-4">
                                <Progress value={deleteProgress} className="h-2" />
                                <p className="text-sm text-center text-muted-foreground">{deleteStatus}</p>
                            </div>
                        ) : (
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                                <Button variant="destructive" onClick={handleBulkDelete}>Confirm Delete</Button>
                            </DialogFooter>
                        )}
                    </DialogContent>
                </Dialog>
            )}
        </div>

        <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr className="border-b">
                            <th className="p-3 w-10"><Checkbox checked={filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length} onCheckedChange={handleSelectAll} /></th>
                            <th className="p-3 text-left">Name</th>
                            <th className="p-3 text-left">Email</th>
                            <th className="p-3 text-left">Phone</th>
                            <th className="p-3 text-left">Owner</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoadingContacts ? (
                            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading contacts...</td></tr>
                        ) : filteredContacts.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No contacts found.</td></tr>
                        ) : (
                            filteredContacts.map((contact: any) => (
                                <tr key={contact.id} className="border-b hover:bg-muted/20">
                                    <td className="p-3"><Checkbox checked={selectedContacts.has(contact.id)} onCheckedChange={(c) => handleSelectOne(contact.id, c === true)} /></td>
                                    <td className="p-3 font-medium">{contact.Full_Name || contact.Last_Name}</td>
                                    <td className="p-3">{contact.Email || '-'}</td>
                                    <td className="p-3">{contact.Mobile || contact.Phone || '-'}</td>
                                    <td className="p-3 text-muted-foreground">{contact.Owner?.name}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="p-2 border-t bg-muted/20 text-xs text-muted-foreground text-center">
                Showing {filteredContacts.length} records
            </div>
        </div>
      </div>
    </div>
  );
}