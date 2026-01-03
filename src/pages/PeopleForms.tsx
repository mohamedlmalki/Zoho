// --- FILE: src/pages/PeopleForms.tsx ---

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useLocation } from 'react-router-dom'; 
import { Profile, PeopleJobs, PeopleJobState, PeopleFormData } from '@/App';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
    FileText, RefreshCw, Loader2, Check, X, Shield, Send, Users, Clock, 
    Pause, Play, Square, CheckCircle2, XCircle, Hourglass, RotateCcw
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeopleResultsDisplay } from "@/components/dashboard/people/PeopleResultsDisplay";
import { formatTime } from '@/lib/utils';

const SERVER_URL = "http://localhost:3000";

// Interface for Form List
interface PeopleForm {
    componentId: number;
    iscustom: boolean;
    displayName: string;
    formLinkName: string;
    PermissionDetails: { Add: number; Edit: number; View: number; };
    isVisible: boolean;
    viewDetails: { view_Id: number; view_Name: string; };
}

// Interface for Form Fields
interface FormComponent {
    comptype: string;
    ismandatory: boolean;
    displayname: string;
    labelname: string;
    maxLength?: number;
    Options?: { [key: string]: { Value: string; Id: string; } };
    tabularSections?: { [key: string]: any[] };
}

interface PeopleFormsProps {
  jobs: PeopleJobs;
  setJobs: React.Dispatch<React.SetStateAction<PeopleJobs>>;
  socket: Socket | null;
  createInitialJobState: () => PeopleJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

// Dynamic Form Field Renderer (for both single and bulk)
const DynamicFormField = ({ field, value, onChange, isBulk = false, disabled = false }: { 
    field: FormComponent, 
    value: string, 
    onChange: (labelname: string, value: string) => void,
    isBulk?: boolean,
    disabled?: boolean
}) => {
    const id = `field-${isBulk ? 'bulk-' : ''}${field.labelname}`;
    
    // In bulk mode, we only use simple inputs for default values.
    if (isBulk) {
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>
                    {field.displayname} (default) {field.ismandatory && <span className="text-destructive">*</span>}
                </Label>
                <Input 
                    id={id} 
                    type="text" 
                    value={value} 
                    onChange={(e) => onChange(field.labelname, e.target.value)}
                    placeholder={`Default value for ${field.displayname}`}
                    disabled={disabled}
                />
            </div>
        );
    }
    
    // Single Record Mode Logic
    switch (field.comptype) {
        case 'Email':
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Input id={id} type="email" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} maxLength={field.maxLength} disabled={disabled} />
                </div>
            );
        case 'Text':
        case 'Phone':
        case 'Number':
        case 'Auto_Number':
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Input 
                        id={id} 
                        type={field.comptype === 'Number' ? 'number' : 'text'}
                        value={value} 
                        onChange={(e) => onChange(field.labelname, e.target.value)}
                        maxLength={field.maxLength}
                        disabled={field.comptype === 'Auto_Number' || disabled}
                    />
                </div>
            );
        case 'Multi_Line':
            return (
                 <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Textarea id={id} value={value} onChange={(e) => onChange(field.labelname, e.target.value)} maxLength={field.maxLength} disabled={disabled} />
                </div>
            );
        case 'Lookup':
            if (field.Options) {
                 return (
                    <div className="space-y-2">
                        <Label htmlFor={id}>
                            {field.displayname} {field.ismandatory && <span className="text-destructive">*</span>}
                        </Label>
                        <Select value={value} onValueChange={(val) => onChange(field.labelname, val)} disabled={disabled}>
                            <SelectTrigger id={id}><SelectValue placeholder="Select an option..." /></SelectTrigger>
                            <SelectContent>
                                {Object.values(field.Options).map(opt => (
                                    <SelectItem key={opt.Id} value={opt.Id}>{opt.Value}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                );
            }
            return (
                 <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.displayname} (Lookup ID) {field.ismandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Input id={id} type="text" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} placeholder="Enter Lookup ID" disabled={disabled} />
                </div>
            )
        
        default:
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.displayname} ({field.comptype}) {field.ismandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Input id={id} type="text" value={value} onChange={(e) => onChange(field.labelname, e.target.value)} placeholder={`Enter value for ${field.labelname}`} disabled={disabled} />
                </div>
            );
    }
}


const PeopleForms: React.FC<PeopleFormsProps> = (props) => {
  const location = useLocation(); 
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Checking...' });
  const { toast } = useToast(); 
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  
  const [forms, setForms] = useState<PeopleForm[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  
  const [components, setComponents] = useState<FormComponent[]>([]);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [singleFormData, setSingleFormData] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showCustomOnly, setShowCustomOnly] = useState(true);
  
  // Ref to ensure we only handle the redirect once per mount
  const redirectProcessed = useRef(false);

  const { jobs, setJobs, createInitialJobState } = props;

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${SERVER_URL}/api/profiles`).then(res => res.json()),
  });

  const peopleProfiles = useMemo(() => {
    return profiles.filter(p => p.people && p.people.orgId);
  }, [profiles]);

  const selectedProfile = peopleProfiles.find(p => p.profileName === activeProfileName) || null;

  const activeJob = useMemo(() => {
      if (selectedProfile && jobs[selectedProfile.profileName]) {
          return jobs[selectedProfile.profileName];
      }
      return createInitialJobState();
  }, [jobs, selectedProfile, createInitialJobState]);

  const { formData } = activeJob;
  const { 
    selectedFormId, 
    bulkPrimaryField, 
    bulkPrimaryValues, 
    bulkDefaultData, 
    bulkDelay,
    stopAfterFailures 
  } = formData;

  // --- NEW: Calculate Record Count ---
  const recordCount = useMemo(() => {
      if (!bulkPrimaryValues) return 0;
      return bulkPrimaryValues.split('\n').filter(line => line.trim() !== '').length;
  }, [bulkPrimaryValues]);

  const filteredForms = useMemo(() => {
    if (!showCustomOnly) return forms;
    return forms.filter(form => form.iscustom === true);
  }, [forms, showCustomOnly]);

  const selectedForm = useMemo(() => {
    return forms.find(form => form.componentId.toString() === selectedFormId);
  }, [forms, selectedFormId]);
  
  const formFields = useMemo(() => {
      return components.filter(c => !c.tabularSections);
  }, [components]);

  const autoEmailField = useMemo(() => {
      return formFields.find(f => f.comptype === 'Email' || f.labelname.includes('Email'))?.labelname || null;
  }, [formFields]);

  useEffect(() => {
    if (!bulkPrimaryField && !activeJob.isProcessing) {
      if (autoEmailField) {
        handleFormStateChange('bulkPrimaryField', autoEmailField);
      } else if (formFields.length > 0) {
        handleFormStateChange('bulkPrimaryField', formFields[0].labelname);
      }
    }
  }, [autoEmailField, formFields, activeJob.isProcessing]);

  useEffect(() => {
    if (peopleProfiles.length === 0) return;

    if (!redirectProcessed.current && location.state?.targetProfile) {
        const target = peopleProfiles.find(p => p.profileName === location.state.targetProfile);
        if (target) {
            setActiveProfileName(target.profileName);
            redirectProcessed.current = true;
            return;
        }
    }

    if (!activeProfileName) {
      setActiveProfileName(peopleProfiles[0].profileName);
    }
  }, [peopleProfiles, activeProfileName, location.state]);
  
  const fetchForms = useCallback(() => {
    if (props.socket && selectedProfile) {
        setIsLoadingForms(true);
        props.socket.emit('getPeopleForms', {
            selectedProfileName: selectedProfile.profileName
        });
    }
  }, [props.socket, selectedProfile]);

  useEffect(() => {
    if (!props.socket) return;
    
    const handleApiStatus = (result: any) => {
      setApiStatus(result.success ? 
        { status: 'success', message: result.message, fullResponse: result.fullResponse } :
        { status: 'error', message: result.message, fullResponse: result.fullResponse }
      );
    };
    
    const handleFormsResult = (result: { success: boolean, forms?: PeopleForm[], error?: string }) => {
        setIsLoadingForms(false);
        if (result.success && result.forms) {
            setForms(result.forms);
        } else {
            setForms([]);
            toast({ title: "Error Fetching Forms", description: result.error, variant: "destructive" });
        }
    };
    
    const handleFormComponentsResult = (result: { success: boolean, components?: FormComponent[], error?: string }) => {
        setIsLoadingComponents(false);
        if (result.success && result.components) {
            setComponents(result.components);
            setSingleFormData({});
        } else {
            setComponents([]);
            toast({ title: "Error Fetching Form Fields", description: result.error, variant: "destructive" });
        }
    };
    
    const handleInsertResult = (result: { success: boolean, result?: any, error?: string }) => {
        setIsSubmitting(false);
        if (result.success) {
            toast({ 
                title: "Record Added Successfully", 
                description: result.result?.message || `Record ID: ${result.result?.pkId}` 
            });
            setSingleFormData({});
        } else {
            toast({ title: "Failed to Add Record", description: result.error, variant: "destructive" });
        }
    };
    
    props.socket.on('apiStatusResult', handleApiStatus);
    props.socket.on('peopleFormsResult', handleFormsResult);
    props.socket.on('peopleFormComponentsResult', handleFormComponentsResult);
    props.socket.on('peopleInsertRecordResult', handleInsertResult);
    
    return () => {
      props.socket.off('apiStatusResult', handleApiStatus);
      props.socket.off('peopleFormsResult', handleFormsResult);
      props.socket.off('peopleFormComponentsResult', handleFormComponentsResult);
      props.socket.off('peopleInsertRecordResult', handleInsertResult);
    };
  }, [props.socket, toast]);

  useEffect(() => {
    if (selectedProfile && props.socket) {
        fetchForms();
    }
  }, [selectedProfile, props.socket]);

  useEffect(() => {
    if (selectedForm && props.socket) {
        setIsLoadingComponents(true);
        setComponents([]);
        props.socket.emit('getPeopleFormComponents', {
            selectedProfileName: selectedProfile?.profileName,
            formLinkName: selectedForm.formLinkName
        });
    } else {
        setComponents([]);
        setSingleFormData({});
    }
  }, [selectedForm, props.socket, selectedProfile]);
  
  useEffect(() => {
    if (!activeJob.isProcessing && filteredForms.length > 0 && !selectedFormId) {
      handleFormStateChange('selectedFormId', filteredForms[0].componentId.toString());
    }
    
    if (selectedFormId && !filteredForms.find(f => f.componentId.toString() === selectedFormId)) {
        if (!activeJob.isProcessing) {
             handleFormStateChange('selectedFormId', filteredForms.length > 0 ? filteredForms[0].componentId.toString() : "");
        }
    }
  }, [filteredForms, selectedFormId, activeJob.isProcessing]);

  const handleManualVerify = (service: string = 'people') => {
    if (props.socket && selectedProfile) {
      setApiStatus({ status: 'loading', message: 'Verifying...' });
      props.socket.emit('checkApiStatus', {
        selectedProfileName: selectedProfile.profileName,
        service: service,
      });
    }
  };

  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    setApiStatus({ status: 'loading', message: 'Checking...' });
    setForms([]);
    setComponents([]);
  };
  
  const handleSingleFormChange = (labelname: string, value: string) => {
      setSingleFormData(prev => ({ ...prev, [labelname]: value }));
  };
  
  const handleSubmit = () => {
      if (!selectedForm || !props.socket) return;
      
      for (const field of formFields) {
          if (field.ismandatory && !singleFormData[field.labelname]) {
              toast({ title: "Missing Mandatory Field", description: `"${field.displayname}" is required.`, variant: "destructive" });
              return;
          }
      }
      
      setIsSubmitting(true);
      props.socket.emit('insertPeopleRecord', {
          selectedProfileName: selectedProfile?.profileName,
          formLinkName: selectedForm.formLinkName,
          inputData: singleFormData
      });
  };

  const handleToggleChange = (checked: boolean) => {
    setShowCustomOnly(checked);
  };
  
  const handleFormStateChange = (field: keyof PeopleFormData, value: any) => {
    if (selectedProfile) {
      setJobs(prev => {
        const currentJob = prev[selectedProfile.profileName] || createInitialJobState();
        return {
          ...prev,
          [selectedProfile.profileName]: {
            ...currentJob,
            formData: {
              ...currentJob.formData,
              [field]: value
            }
          }
        };
      });
    }
  };
  
  const handleBulkDefaultDataChange = (labelname: string, value: string) => {
    if (selectedProfile) {
      setJobs(prev => {
        const currentJob = prev[selectedProfile.profileName] || createInitialJobState();
        return {
          ...prev,
          [selectedProfile.profileName]: {
            ...currentJob,
            formData: {
              ...currentJob.formData,
              bulkDefaultData: {
                ...currentJob.formData.bulkDefaultData,
                [labelname]: value
              }
            }
          }
        };
      });
    }
  };

  const handleStartBulkImport = () => {
    if (!props.socket || !selectedProfile || !selectedForm || !bulkPrimaryField) {
        toast({ title: "Error", description: "Missing profile, form, or primary field.", variant: "destructive" });
        return;
    }
    
    const primaryValues = bulkPrimaryValues.split('\n').map(v => v.trim()).filter(Boolean);
    if (primaryValues.length === 0) {
        toast({ title: "No Primary Values", description: "Please paste values into the list.", variant: "destructive" });
        return;
    }

    setJobs(prev => {
      const currentJob = prev[selectedProfile.profileName] || createInitialJobState();
      return {
        ...prev,
        [selectedProfile.profileName]: {
            ...currentJob,
            isProcessing: true,
            isPaused: false,
            isComplete: false,
            processingStartTime: new Date(),
            totalToProcess: primaryValues.length,
            currentDelay: bulkDelay,
            results: [], 
            filterText: '',
            processingTime: 0, 
        }
      };
    });
    
    props.socket.emit('startBulkInsertPeopleRecords', {
        selectedProfileName: selectedProfile.profileName,
        formLinkName: selectedForm.formLinkName,
        primaryFieldLabelName: bulkPrimaryField,
        primaryFieldValues: primaryValues,
        defaultData: bulkDefaultData,
        delay: bulkDelay,
        stopAfterFailures: stopAfterFailures || 0
    });
  };

  const handlePauseResume = () => {
    if (!props.socket || !selectedProfile) return;
    const isPaused = activeJob.isPaused;
    props.socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: selectedProfile.profileName, jobType: 'people' });
    setJobs(prev => ({ ...prev, [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };

  const handleEndJob = () => {
    if (!props.socket || !selectedProfile) return;
    props.socket.emit('endJob', { profileName: selectedProfile.profileName, jobType: 'people' });
  };
  
  const handleFilterTextChange = (text: string) => {
    if (selectedProfile) {
      setJobs(prev => {
        const profileJob = prev[selectedProfile.profileName] || createInitialJobState();
        return {
          ...prev,
          [selectedProfile.profileName]: {
            ...profileJob,
            filterText: text
          }
        };
      });
    }
  };

  // --- NEW: RETRY FAILED LOGIC ---
  const handleRetryFailed = () => {
      if (!selectedProfile || !activeJob) return;

      const failedItems = activeJob.results.filter(r => !r.success);
      if (failedItems.length === 0) {
          toast({ title: "No failed items found to retry." });
          return;
      }

      // Assuming 'email' or primary field is the key identifier
      const failedValues = failedItems.map(r => r.email).join('\n'); 

      setJobs(prev => ({
          ...prev,
          [selectedProfile.profileName]: {
              ...prev[selectedProfile.profileName],
              isProcessing: false,
              isPaused: false,
              isComplete: false,
              results: [],
              processingTime: 0,
              totalToProcess: failedItems.length,
              formData: {
                  ...prev[selectedProfile.profileName].formData,
                  bulkPrimaryValues: failedValues // Load emails into form
              }
          }
      }));
      toast({ title: "Retry Ready", description: `${failedItems.length} failed records loaded. Click Start.` });
  };
  // ------------------------------

  const layoutProps = {
    onAddProfile: props.onAddProfile,
    onEditProfile: props.onEditProfile,
    onDeleteProfile: props.onDeleteProfile,
    profiles: peopleProfiles,
    selectedProfile: selectedProfile,
    onProfileChange: handleProfileChange,
    apiStatus: apiStatus,
    onShowStatus: () => setIsStatusModalOpen(true),
    onManualVerify: () => handleManualVerify('people'),
    socket: props.socket,
    jobs: props.jobs,
    stats: {
      totalTickets: activeJob?.results.length || 0,
      totalToProcess: activeJob?.totalToProcess || 0,
      isProcessing: activeJob?.isProcessing || false,
    },
    service: 'people' as const, 
  };
  
  const remainingCount = activeJob.totalToProcess - activeJob.results.length;

  return (
    <>
      <DashboardLayout {...layoutProps}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold md:text-2xl">Zoho People Forms</h1>
          <Button onClick={fetchForms} disabled={isLoadingForms || !selectedProfile}>
            {isLoadingForms ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Forms
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              Select a Form
            </CardTitle>
            <CardDescription>
              Select a form to view its details and add a new record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="form-select">Available Forms ({filteredForms.length})</Label>
                    <div className="flex items-center space-x-2">
                        <Switch 
                            id="custom-forms-only" 
                            checked={showCustomOnly} 
                            onCheckedChange={handleToggleChange}
                            disabled={activeJob.isProcessing}
                        />
                        <Label htmlFor="custom-forms-only">Show Custom Only</Label>
                    </div>
                </div>
                <Select
                    value={selectedFormId}
                    onValueChange={(val) => handleFormStateChange('selectedFormId', val)}
                    disabled={isLoadingForms || forms.length === 0 || activeJob.isProcessing}
                >
                    <SelectTrigger id="form-select" className="w-full">
                        <SelectValue placeholder={isLoadingForms ? "Loading forms..." : "Select a form..."} />
                    </SelectTrigger>
                    <SelectContent className="z-[99]">
                        {filteredForms.map((form) => (
                            <SelectItem key={form.componentId} value={form.componentId.toString()}>
                                <div className="flex items-center space-x-2">
                                    {form.iscustom ? (
                                        <Badge variant="outline">Custom</Badge>
                                    ) : (
                                        <Badge variant="secondary">System</Badge>
                                    )}
                                    <span>{form.displayName}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            {selectedForm && (
              <Tabs defaultValue="bulk" className="w-full"> 
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="single" disabled={activeJob.isProcessing}>Single Record</TabsTrigger>
                  <TabsTrigger value="bulk" disabled={activeJob.isProcessing}>Bulk Import</TabsTrigger>
                </TabsList>
                
                <TabsContent value="single">
                    <Card>
                        <CardHeader>
                            <CardTitle>Add Record to "{selectedForm.displayName}"</CardTitle>
                            <CardDescription>
                                Fill out the fields below to add a new record.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoadingComponents ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : formFields.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {formFields.map(field => (
                                        <DynamicFormField 
                                            key={field.labelname}
                                            field={field}
                                            value={singleFormData[field.labelname] || ''}
                                            onChange={handleSingleFormChange}
                                            disabled={isSubmitting}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No fields found for this form or fields could not be loaded.</p>
                            )}
                        </CardContent>
                        {formFields.length > 0 && (
                            <>
                                <Separator />
                                <CardFooter className="pt-6">
                                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                                        {isSubmitting ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Send className="mr-2 h-4 w-4" /> )}
                                        Submit Record
                                    </Button>
                                </CardFooter>
                            </>
                        )}
                    </Card>
                </TabsContent>
                
                <TabsContent value="bulk">
                   <Card>
                        <CardHeader>
                            <CardTitle>Bulk Import to "{selectedForm.displayName}"</CardTitle>
                            <CardDescription>
                                Paste a list of values for a primary field, and set default values for all other fields.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isLoadingComponents ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : formFields.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <Label htmlFor="primary-values">
                                                    {formFields.find(f => f.labelname === bulkPrimaryField)?.displayname || 'Values'} (one per line)
                                                </Label>
                                                {/* --- NEW: Record Counter Badge --- */}
                                                <Badge variant="secondary" className="font-mono text-xs">
                                                    {recordCount} records
                                                </Badge>
                                            </div>
                                            <Textarea
                                                id="primary-values"
                                                placeholder="Value 1&#x0A;Value 2&#x0A;Value 3"
                                                className="min-h-[200px] font-mono"
                                                value={bulkPrimaryValues}
                                                onChange={(e) => handleFormStateChange('bulkPrimaryValues', e.target.value)}
                                                disabled={activeJob.isProcessing}
                                            />
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="primary-field">Primary Field (List)</Label>
                                            <Select 
                                                value={bulkPrimaryField} 
                                                onValueChange={(val) => handleFormStateChange('bulkPrimaryField', val)} 
                                                disabled={activeJob.isProcessing}
                                            >
                                                <SelectTrigger id="primary-field"><SelectValue placeholder="Select primary field..." /></SelectTrigger>
                                                <SelectContent>
                                                    {formFields.map(f => (
                                                        <SelectItem key={f.labelname} value={f.labelname}>{f.displayname}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* --- Delay Input + Auto-Pause + Stats --- */}
                                        <div className="flex flex-wrap items-end gap-6 pt-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="delay">Delay (seconds)</Label>
                                                <Input
                                                    id="delay"
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={bulkDelay}
                                                    onChange={(e) => handleFormStateChange('bulkDelay', parseInt(e.target.value) || 0)}
                                                    className="w-24"
                                                    disabled={activeJob.isProcessing}
                                                />
                                            </div>

                                            {/* --- NEW AUTO-PAUSE INPUT --- */}
                                            <div className="space-y-2">
                                                <Label htmlFor="stopFailures" className="whitespace-nowrap">
                                                    Auto-pause after errors
                                                </Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        id="stopFailures"
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={stopAfterFailures || 0}
                                                        onChange={(e) => handleFormStateChange('stopAfterFailures', parseInt(e.target.value) || 0)}
                                                        className="w-24"
                                                        disabled={activeJob.isProcessing}
                                                    />
                                                    <span className="text-xs text-muted-foreground">(0 = disabled)</span>
                                                </div>
                                            </div>
                                            {/* --------------------------- */}

                                            {activeJob && (activeJob.isProcessing || activeJob.results.length > 0) && (
                                                <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-md border border-border h-10">
                                                    <div className="flex items-center gap-2 px-2">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        <span className="font-mono text-sm font-medium">{formatTime(activeJob.processingTime)}</span>
                                                    </div>
                                                    <Separator orientation="vertical" className="h-4" />
                                                    <div className="flex items-center gap-2 px-2">
                                                        <Hourglass className="h-3 w-3 text-muted-foreground" />
                                                        <span className="font-mono text-sm font-medium">{remainingCount < 0 ? 0 : remainingCount}</span>
                                                    </div>
                                                    <Separator orientation="vertical" className="h-4" />
                                                    <div className="flex items-center gap-2 px-2 text-success">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        <span className="font-mono text-sm font-bold">{activeJob.results.filter(r => r.success).length}</span>
                                                    </div>
                                                    <Separator orientation="vertical" className="h-4" />
                                                    <div className="flex items-center gap-2 px-2 text-destructive">
                                                        <XCircle className="h-3 w-3" />
                                                        <span className="font-mono text-sm font-bold">{activeJob.results.filter(r => !r.success).length}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* -------------------------------------- */}

                                    </div>
                                    
                                    <div className="space-y-4">
                                        <Label>Default Values (for all records)</Label>
                                        {formFields.filter(f => f.labelname !== bulkPrimaryField).map(field => (
                                            <DynamicFormField
                                                key={`bulk-${field.labelname}`}
                                                field={field}
                                                value={bulkDefaultData[field.labelname] || ''}
                                                onChange={handleBulkDefaultDataChange}
                                                isBulk={true}
                                                disabled={activeJob.isProcessing}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No fields found for this form or fields could not be loaded.</p>
                            )}

                        </CardContent>
                        {formFields.length > 0 && (
                             <CardFooter className="flex flex-col gap-3">
                                {!activeJob.isProcessing ? (
                                    <div className="flex gap-2 w-full">
                                        <Button
                                            onClick={handleStartBulkImport}
                                            disabled={!bulkPrimaryField || !bulkPrimaryValues}
                                            variant="premium"
                                            size="lg"
                                            className="flex-1"
                                        >
                                            <Send className="mr-2 h-4 w-4" />
                                            Start Bulk Import
                                        </Button>

                                        {/* --- NEW: Retry Button --- */}
                                        {activeJob.results.filter(r => !r.success).length > 0 && (
                                            <Button
                                                variant="secondary"
                                                size="lg"
                                                className="border-red-200 hover:bg-red-50 text-red-700"
                                                onClick={handleRetryFailed}
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Retry Failed ({activeJob.results.filter(r => !r.success).length})
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center space-x-4 w-full">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="lg"
                                            onClick={handlePauseResume}
                                        >
                                            {activeJob.isPaused ? (
                                                <><Play className="h-4 w-4 mr-2" />Resume Job</>
                                            ) : (
                                                <><Pause className="h-4 w-4 mr-2" />Pause Job</>
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="lg"
                                            onClick={handleEndJob}
                                        >
                                            <Square className="h-4 w-4 mr-2" />
                                            End Job
                                        </Button>
                                    </div>
                                )}
                             </CardFooter>
                        )}
                   </Card>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
        
        {selectedProfile && (
            <PeopleResultsDisplay
                results={activeJob.results}
                isProcessing={activeJob.isProcessing}
                isComplete={activeJob.isComplete}
                totalToProcess={activeJob.totalToProcess}
                countdown={activeJob.countdown}
                filterText={activeJob.filterText}
                onFilterTextChange={handleFilterTextChange}
                primaryFieldLabel={formFields.find(f => f.labelname === bulkPrimaryField)?.displayname || 'Primary Field'}
            />
        )}
      </DashboardLayout>

      {/* Status Modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Connection Status</DialogTitle>
            <DialogDescription>
              This is the live status of the connection to the Zoho People API.
            </DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-md ${
            apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' 
            : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' 
            : 'bg-muted'
          }`}>
            <p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p>
          </div>
          {apiStatus.fullResponse && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4>
              <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">
                {JSON.stringify(apiStatus.fullResponse, null, 2)}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PeopleForms;