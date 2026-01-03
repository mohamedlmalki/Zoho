import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { Profile, CreatorJobs, CreatorJobState, CreatorFormData } from '@/App';
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
    FileText, RefreshCw, Loader2, Send, Clock, 
    Pause, Play, Square, CheckCircle2, XCircle,
    ImagePlus, Eye, Users, Hash, AlertTriangle, RotateCcw 
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreatorResultsDisplay } from "@/components/dashboard/creator/CreatorResultsDisplay";
import { formatTime } from '@/lib/utils';

const SERVER_URL = "http://localhost:3000";

interface CreatorForm {
    display_name: string;
    link_name: string;
    type: number; // 1 for DB, 2 for Stateless
}

interface CreatorField {
    display_name: string;
    link_name: string;
    type: number;
    mandatory: boolean;
    subfields?: { link_name: string, display_name: string }[];
    choices?: { key: string, value: string }[];
    is_hidden?: boolean;
}

interface CreatorFormsProps {
  jobs: CreatorJobs;
  setJobs: React.Dispatch<React.SetStateAction<CreatorJobs>>;
  socket: Socket | null;
  createInitialJobState: () => CreatorJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

const ImageToolDialog = ({ onApply }: { onApply: (html: string) => void }) => {
    const [imageUrl, setImageUrl] = useState('');
    const [altText, setAltText] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [width, setWidth] = useState('80');
    const [maxWidth, setMaxWidth] = useState('500');
    const [alignment, setAlignment] = useState('center');
    const [isOpen, setIsOpen] = useState(false);

    const handleApply = () => {
        let style = `width: ${width}%; max-width: ${maxWidth}px; height: auto; border: 1px solid #dddddd; margin-top: 10px; margin-bottom: 10px;`;
        let imgTag = `<img src="${imageUrl}" alt="${altText}" style="${style}" />`;
        
        if (linkUrl) {
            imgTag = `<a href="${linkUrl}">${imgTag}</a>`;
        }

        const containerStyle = `text-align: ${alignment};`;
        const finalHtml = `<div style="${containerStyle}">${imgTag}</div>`;
        
        onApply(finalHtml);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <ImagePlus className="h-3 w-3 mr-1" />
                    Add Image
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add and Style Image</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
                        <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/image.png" />
                    </div>
                    {imageUrl && (
                        <div className="col-span-4 flex justify-center p-4 bg-muted rounded-md">
                            <img src={imageUrl} alt="Preview" className="max-w-full max-h-48" />
                        </div>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="altText" className="text-right">Alt Text</Label>
                        <Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="col-span-3" placeholder="Description of the image" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="linkUrl" className="text-right">Link URL</Label>
                        <Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="col-span-3" placeholder="(Optional) Make image clickable" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="width" className="text-right">Width (%)</Label>
                        <Input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="maxWidth" className="text-right">Max Width (px)</Label>
                        <Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="alignment" className="text-right">Alignment</Label>
                        <Select value={alignment} onValueChange={setAlignment}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleApply} disabled={!imageUrl}>Apply and Insert</Button>
            </DialogContent>
        </Dialog>
    );
};


const DynamicFormField = ({ field, value, onChange, isBulk = false, disabled = false }: { 
    field: CreatorField, 
    value: string | string[],
    onChange: (labelname: string, value: string | string[] | object) => void,
    isBulk?: boolean,
    disabled?: boolean
}) => {
    const id = `field-${isBulk ? 'bulk-' : ''}${field.link_name}`;
    
    if (isBulk) {
        if (field.type === 21 || field.type === 30 || field.type === 29) return null; 
        
        switch (field.type) {
            case 2: // Multi Line
            case 4: // Rich Text
                return (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor={id}>
                                {field.display_name} (default) {field.mandatory && <span className="text-destructive">*</span>}
                            </Label>
                            <div className="flex items-center space-x-2">
                                <ImageToolDialog onApply={(html) => onChange(field.link_name, (value as string || '') + '\n' + html)} />
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                            <Eye className="h-3 w-3 mr-1" />
                                            Preview
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>Preview: {field.display_name}</DialogTitle>
                                        </DialogHeader>
                                        <div
                                            className="p-4 bg-muted rounded-lg border max-h-96 overflow-y-auto prose dark:prose-invert"
                                            dangerouslySetInnerHTML={{ __html: (value as string || '') }}
                                        />
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                        <Textarea 
                            id={id} 
                            value={value as string || ''} 
                            onChange={(e) => onChange(field.link_name, e.target.value)}
                            placeholder={`Default value for ${field.display_name}`}
                            disabled={disabled}
                            className="min-h-[100px]"
                        />
                    </div>
                );
            default:
                return (
                    <div className="space-y-2">
                        <Label htmlFor={id}>
                            {field.display_name} (default) {field.mandatory && <span className="text-destructive">*</span>}
                        </Label>
                        <Input 
                            id={id} 
                            type="text" 
                            value={value as string || ''} 
                            onChange={(e) => onChange(field.link_name, e.target.value)}
                            placeholder={`Default value for ${field.display_name}`}
                            disabled={disabled}
                        />
                    </div>
                );
        }
    }
    
    switch (field.type) {
        case 1:
        case 3:
        case 27:
        case 5:
        case 9:
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Input 
                        id={id} 
                        type={field.type === 3 ? 'email' : field.type === 5 ? 'number' : 'text'}
                        value={value as string || ''} 
                        onChange={(e) => onChange(field.link_name, e.target.value)}
                        disabled={field.type === 9 || disabled}
                    />
                </div>
            );
        case 2:
        case 4:
            return (
                 <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Textarea id={id} value={value as string || ''} onChange={(e) => onChange(field.link_name, e.target.value)} disabled={disabled} />
                </div>
            );
        case 12:
        case 13:
            return (
                <div className="space-y-2">
                    <Label htmlFor={id}>
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </Label>
                    <Select value={value as string || ''} onValueChange={(val) => onChange(field.link_name, val)} disabled={disabled}>
                        <SelectTrigger id={id}><SelectValue placeholder="Select an option..." /></SelectTrigger>
                        <SelectContent>
                            {field.choices?.map(opt => (
                                <SelectItem key={opt.key} value={opt.key}>{opt.value}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            );
        case 16:
             return (
                <div className="flex items-center space-x-2 pt-4">
                    <Switch 
                        id={id} 
                        checked={value === 'true'} 
                        onCheckedChange={(checked) => onChange(field.link_name, checked.toString())}
                        disabled={disabled}
                    />
                    <Label htmlFor={id}>
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </Label>
                </div>
             );
        case 29:
             return (
                <fieldset className="space-y-2 rounded-lg border p-4">
                    <legend className="px-1 text-sm font-medium">
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </legend>
                    <div className="grid grid-cols-2 gap-4">
                        {field.subfields?.map(sub => (
                             <div className="space-y-1" key={sub.link_name}>
                                <Label htmlFor={`${id}-${sub.link_name}`} className="text-xs">{sub.display_name}</Label>
                                <Input 
                                    id={`${id}-${sub.link_name}`}
                                    type="text"
                                    value={(value as any)?.[sub.link_name] || ''}
                                    onChange={(e) => {
                                        const oldVal = (value || {}) as object;
                                        onChange(field.link_name, { ...oldVal, [sub.link_name]: e.target.value })
                                    }}
                                    disabled={disabled}
                                />
                             </div>
                        ))}
                    </div>
                </fieldset>
             );
        case 30:
             return (
                <fieldset className="space-y-2 rounded-lg border p-4 md:col-span-2">
                    <legend className="px-1 text-sm font-medium">
                        {field.display_name} {field.mandatory && <span className="text-destructive">*</span>}
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {field.subfields?.filter(s => !s.is_hidden).map(sub => (
                             <div className="space-y-1" key={sub.link_name}>
                                <Label htmlFor={`${id}-${sub.link_name}`} className="text-xs">{sub.display_name}</Label>
                                <Input 
                                    id={`${id}-${sub.link_name}`}
                                    type="text"
                                    value={(value as any)?.[sub.link_name] || ''}
                                    onChange={(e) => {
                                        const oldVal = (value || {}) as object;
                                        onChange(field.link_name, { ...oldVal, [sub.link_name]: e.target.value })
                                    }}
                                    disabled={disabled}
                                />
                             </div>
                        ))}
                    </div>
                </fieldset>
             );
        
        default:
            return (
                <div className="space-y-2">
                    <Label htmlFor={id} className="text-muted-foreground">
                        {field.display_name} (Type {field.type})
                    </Label>
                    <Input id={id} type="text" disabled placeholder={`Field type ${field.type} not yet supported.`} />
                </div>
            );
    }
}


const CreatorForms: React.FC<CreatorFormsProps> = (props) => {
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Checking...' });
  const { toast } = useToast(); 
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const [forms, setForms] = useState<CreatorForm[]>([]);
  const [fields, setFields] = useState<CreatorField[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  
  const [singleFormData, setSingleFormData] = useState<{ [key: string]: any }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { jobs, setJobs, createInitialJobState } = props;

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${SERVER_URL}/api/profiles`).then(res => res.json()),
  });

  const creatorProfiles = useMemo(() => {
    return profiles.filter(p => p.creator && p.creator.appName && p.creator.ownerName);
  }, [profiles]);

  const selectedProfile = creatorProfiles.find(p => p.profileName === activeProfileName) || null;

  const activeJob = useMemo(() => {
      if (selectedProfile && jobs[selectedProfile.profileName]) {
          return jobs[selectedProfile.profileName];
      }
      return createInitialJobState();
  }, [jobs, selectedProfile, createInitialJobState]);

  const { formData } = activeJob;
  const { 
    selectedFormLinkName, 
    bulkPrimaryField, 
    bulkPrimaryValues, 
    bulkDefaultData, 
    bulkDelay 
  } = formData;

  const stopAfterFailures = (formData as any).stopAfterFailures || 0;

  const selectedForm = useMemo(() => {
    return forms.find(form => form.link_name === selectedFormLinkName);
  }, [forms, selectedFormLinkName]);
  
  const formFields = useMemo(() => {
      return fields.filter(c => c.type !== 21); // Filter out subforms for now
  }, [fields]);

  const autoEmailField = useMemo(() => {
      return formFields.find(f => f.type === 3 || f.link_name.includes('Email'))?.link_name || null;
  }, [formFields]);

  const primaryValuesCount = useMemo(() => {
    return bulkPrimaryValues
      .split('\n')
      .filter(line => line.trim() !== '').length;
  }, [bulkPrimaryValues]);

  useEffect(() => {
    if (!bulkPrimaryField && !activeJob.isProcessing) {
      if (autoEmailField) {
        handleFormStateChange('bulkPrimaryField', autoEmailField);
      } else if (formFields.length > 0) {
        handleFormStateChange('bulkPrimaryField', formFields[0].link_name);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEmailField, formFields, activeJob.isProcessing]);

  useEffect(() => {
    if (creatorProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(creatorProfiles[0].profileName);
    }
  }, [creatorProfiles, activeProfileName]);
  
  const fetchForms = useCallback(() => {
    if (props.socket && selectedProfile) {
        setIsLoadingForms(true);

        if (!activeJob.isProcessing) {
          setForms([]);
          setFields([]);
          handleFormStateChange('selectedFormLinkName', "");
        }
        
        props.socket.emit('getCreatorForms', {
            selectedProfileName: selectedProfile.profileName
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.socket, selectedProfile, activeJob.isProcessing]); 
  
  const fetchFields = useCallback((formLinkName: string) => {
    if (props.socket && selectedProfile && formLinkName) {
        setIsLoadingFields(true);
        setFields([]);
        props.socket.emit('getCreatorFormComponents', {
            selectedProfileName: selectedProfile.profileName,
            formLinkName: formLinkName
        });
    }
  }, [props.socket, selectedProfile]);

  // Set up socket listeners
  useEffect(() => {
    if (!props.socket) return;
    const handleApiStatus = (result: any) => {
      setApiStatus(result.success ? 
        { status: 'success', message: result.message, fullResponse: result.fullResponse } :
        { status: 'error', message: result.message, fullResponse: result.fullResponse }
      );
    };
    
    const handleFormsResult = (result: { success: boolean, forms?: CreatorForm[], error?: string }) => {
        setIsLoadingForms(false);
        if (result.success && result.forms) {
            setForms(result.forms);
        } else {
            setForms([]);
            toast({ title: "Error Fetching Forms", description: result.error, variant: "destructive" });
        }
    };
    
    const handleFormComponentsResult = (result: { success: boolean, fields?: CreatorField[], error?: string }) => {
        setIsLoadingFields(false);
        if (result.success && result.fields) {
            setFields(result.fields);
            setSingleFormData({});
        } else {
            setFields([]);
            toast({ title: "Error Fetching Form Fields", description: result.error, variant: "destructive" });
        }
    };
    
    const handleInsertResult = (result: { success: boolean, data?: any, error?: string }) => {
        setIsSubmitting(false);
        if (result.success && result.data) {
            toast({ 
                title: "Record Added Successfully", 
                description: `Record ID: ${result.data.result?.[0]?.data?.ID || 'N/A'}`
            });
            setSingleFormData({});
        } else {
            toast({ title: "Failed to Add Record", description: result.error, variant: "destructive" });
        }
    };
    
    props.socket.on('apiStatusResult', handleApiStatus);
    props.socket.on('creatorFormsResult', handleFormsResult);
    props.socket.on('creatorFormComponentsResult', handleFormComponentsResult);
    props.socket.on('insertCreatorRecordResult', handleInsertResult);
    
    return () => {
      props.socket.off('apiStatusResult', handleApiStatus);
      props.socket.off('creatorFormsResult', handleFormsResult);
      props.socket.off('creatorFormComponentsResult', handleFormComponentsResult);
      props.socket.off('insertCreatorRecordResult', handleInsertResult);
    };
  }, [props.socket, toast]);

  useEffect(() => {
    if (selectedProfile && props.socket) {
        fetchForms();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile, props.socket, fetchForms]);

  useEffect(() => {
    if (selectedFormLinkName && props.socket) {
        fetchFields(selectedFormLinkName);
    } else {
        setFields([]);
        setSingleFormData({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormLinkName, props.socket]);
  
  // Auto-select first form
  useEffect(() => {
    if (!activeJob.isProcessing && forms.length > 0 && !selectedFormLinkName) {
      handleFormStateChange('selectedFormLinkName', forms[0].link_name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forms, selectedFormLinkName, activeJob.isProcessing]);

  const handleManualVerify = (service: string = 'creator') => {
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
    setFields([]);
  };
  
  const handleSingleFormChange = (labelname: string, value: string | string[] | object) => {
      setSingleFormData(prev => ({ ...prev, [labelname]: value }));
  };
  
  const handleSubmit = () => {
      if (!selectedForm || !props.socket) return;
      
      for (const field of formFields) {
          if (field.mandatory && !singleFormData[field.link_name]) {
              toast({ title: "Missing Mandatory Field", description: `"${field.display_name}" is required.`, variant: "destructive" });
              return;
          }
      }
      
      setIsSubmitting(true);
      props.socket.emit('insertCreatorRecord', {
          selectedProfileName: selectedProfile?.profileName,
          formLinkName: selectedForm.link_name,
          formData: singleFormData 
      });
  };

  const handleFormStateChange = (field: keyof CreatorFormData | 'stopAfterFailures', value: any) => {
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
    
    props.socket.emit('startBulkInsertCreatorRecords', {
        selectedProfileName: selectedProfile.profileName,
        selectedFormLinkName: selectedForm.link_name,
        bulkPrimaryField: bulkPrimaryField,
        bulkPrimaryValues: primaryValues,
        bulkDefaultData: bulkDefaultData,
        bulkDelay: bulkDelay,
        activeProfile: selectedProfile,
        stopAfterFailures: stopAfterFailures
    });
  };

  const handlePauseResume = () => {
    if (!props.socket || !selectedProfile) return;
    const isPaused = activeJob.isPaused;
    props.socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: selectedProfile.profileName, jobType: 'creator' });
    setJobs(prev => ({ ...prev, [selectedProfile.profileName]: { ...prev[selectedProfile.profileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };

  const handleEndJob = () => {
    if (!props.socket || !selectedProfile) return;
    props.socket.emit('endJob', { profileName: selectedProfile.profileName, jobType: 'creator' });
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
          toast({ title: "No failed records found to retry." });
          return;
      }

      // Extract failed values
      const failedValues = failedItems.map(r => r.primaryValue).join('\n');

      // Update Form Data and Reset Job State
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
                  bulkPrimaryValues: failedValues
              }
          }
      }));

      toast({ title: "Retry Ready", description: `${failedItems.length} failed records loaded. Click 'Start Bulk Import'.` });
  };
  // ------------------------------

  const layoutProps = {
    onAddProfile: props.onAddProfile,
    onEditProfile: props.onEditProfile,
    onDeleteProfile: props.onDeleteProfile,
    profiles: creatorProfiles,
    selectedProfile: selectedProfile,
    onProfileChange: handleProfileChange,
    apiStatus: apiStatus,
    onShowStatus: () => setIsStatusModalOpen(true),
    onManualVerify: () => handleManualVerify('creator'),
    socket: props.socket,
    jobs: props.jobs,
    stats: {
      totalTickets: activeJob?.results.length || 0,
      totalToProcess: activeJob?.totalToProcess || 0,
      isProcessing: activeJob?.isProcessing || false,
    },
    service: 'creator' as const, 
  };
  
  return (
    <>
      <DashboardLayout {...layoutProps}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold md:text-2xl">Zoho Creator Forms</h1>
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
              Select a form from your Creator app to add a new record or start a bulk import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="form-select">Available Forms ({forms.length})</Label>
                <Select
                    value={selectedFormLinkName}
                    onValueChange={(val) => {
                        handleFormStateChange('selectedFormLinkName', val);
                        fetchFields(val);
                    }}
                    disabled={isLoadingForms || forms.length === 0 || activeJob.isProcessing}
                >
                    <SelectTrigger id="form-select" className="w-full">
                        <SelectValue placeholder={isLoadingForms ? "Loading forms..." : "Select a form..."} />
                    </SelectTrigger>
                    <SelectContent className="z-[99]">
                        {forms.map((form) => (
                            <SelectItem key={form.link_name} value={form.link_name}>
                                <div className="flex items-center space-x-2">
                                    <Badge variant={form.type === 1 ? "outline" : "secondary"}>
                                        {form.type === 1 ? "Form" : "Stateless"}
                                    </Badge>
                                    <span>{form.display_name}</span>
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
                
                {/* --- Single Record Tab --- */}
                <TabsContent value="single">
                    <Card>
                        <CardHeader>
                            <CardTitle>Add Record to "{selectedForm.display_name}"</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoadingFields ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : formFields.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {formFields.map(field => (
                                        <DynamicFormField 
                                            key={field.link_name}
                                            field={field}
                                            value={singleFormData[field.link_name] || ''}
                                            onChange={handleSingleFormChange}
                                            disabled={isSubmitting}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No fields found for this form.</p>
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
                
                {/* --- Bulk Import Tab --- */}
                <TabsContent value="bulk">
                   <Card>
                        <CardHeader>
                            <CardTitle>Bulk Import to "{selectedForm.display_name}"</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {isLoadingFields ? (
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : formFields.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
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
                                                        <SelectItem key={f.link_name} value={f.link_name}>{f.display_name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="primary-values">
                                                    {formFields.find(f => f.link_name === bulkPrimaryField)?.display_name || 'Values'} (one per line)
                                                </Label>
                                                <Badge variant="secondary" className="text-xs">
                                                    <Hash className="h-3 w-3 mr-1" />
                                                    {primaryValuesCount} records
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
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="delay" className="flex items-center space-x-2">
                                                    <Clock className="h-4 w-4" />
                                                    <span>Delay (sec)</span>
                                                </Label>
                                                <Input
                                                    id="delay"
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={bulkDelay}
                                                    onChange={(e) => handleFormStateChange('bulkDelay', parseInt(e.target.value) || 0)}
                                                    disabled={activeJob.isProcessing}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="stopAfterFailures" className="flex items-center space-x-2">
                                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                    <span>Auto-Pause</span>
                                                </Label>
                                                <Input
                                                    id="stopAfterFailures"
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    placeholder="0 (Disabled)"
                                                    value={stopAfterFailures === 0 ? '' : stopAfterFailures}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        handleFormStateChange('stopAfterFailures' as any, val === '' ? 0 : parseInt(val));
                                                    }}
                                                    className="placeholder:text-muted-foreground/70"
                                                    disabled={activeJob.isProcessing}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <Label>Default Values (for all records)</Label>
                                        {formFields.filter(f => f.link_name !== bulkPrimaryField).map(field => (
                                            <DynamicFormField
                                                key={`bulk-${field.link_name}`}
                                                field={field}
                                                value={bulkDefaultData[field.link_name] || ''}
                                                onChange={handleBulkDefaultDataChange}
                                                isBulk={true}
                                                disabled={activeJob.isProcessing}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No fields found for this form.</p>
                            )}

                            {activeJob && (activeJob.isProcessing || activeJob.results.length > 0) && (
                                <div className="pt-4 border-t border-dashed">
                                    <div className="grid grid-cols-4 gap-4 text-center">
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                                            <p className="text-lg font-bold font-mono">{formatTime(activeJob.processingTime)}</p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Success</Label>
                                            <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                                                <CheckCircle2 className="h-4 w-4" />
                                                <span>{activeJob.results.filter(r => r.success).length}</span>
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Failed</Label>
                                            <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                                                <XCircle className="h-4 w-4" />
                                                <span>{activeJob.results.filter(r => !r.success).length}</span>
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground">Remaining</Label>
                                            <p className="text-lg font-bold font-mono text-muted-foreground flex items-center justify-center space-x-1">
                                                <Clock className="h-4 w-4" />
                                                <span>{(activeJob.totalToProcess || 0) - (activeJob.results.length || 0)}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
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
                                        {activeJob.results.some(r => !r.success) && (
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
                                        {/* ------------------------- */}
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
            <CreatorResultsDisplay
                results={activeJob.results}
                isProcessing={activeJob.isProcessing}
                isComplete={activeJob.isComplete}
                totalToProcess={activeJob.totalToProcess}
                countdown={activeJob.countdown}
                filterText={activeJob.filterText}
                onFilterTextChange={handleFilterTextChange}
                primaryFieldLabel={formFields.find(f => f.link_name === bulkPrimaryField)?.display_name || 'Primary Field'}
            />
        )}
      </DashboardLayout>

      {/* Status Modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Connection Status</DialogTitle>
            <DialogDescription>
              This is the live status of the connection to the Zoho Creator API.
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
              <h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server (Test: Get Forms)</h4>
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

export default CreatorForms;