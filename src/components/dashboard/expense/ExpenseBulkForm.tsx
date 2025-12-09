import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ExpenseJobState, ExpenseBulkField } from '@/App';
import { ProfileSelector } from '../ProfileSelector'; 
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Extend the Zod schema for validation
const expenseBulkFormSchema = z.object({
  selectedProfileName: z.string().min(1, { message: 'Profile is required' }),
  selectedModuleApiName: z.string().min(1, { message: 'Module is required' }),
  bulkIteratingFields: z.array(z.object({
    fieldApiName: z.string().min(1, { message: 'Field is required' }),
    fieldName: z.string().min(1),
    fieldValues: z.string().min(1, { message: 'Values are required for bulk iteration' }),
  })).min(1, { message: 'At least one field must be configured for bulk iteration.' }), // Enforce at least one bulk field
  bulkDefaultData: z.record(z.string(), z.string()).optional(), // For non-iterating fields
  bulkDelay: z.preprocess(
    (v) => (v === '' ? 1 : Number(v)),
    z.number().min(1, { message: 'Delay must be at least 1 second' }),
  ),
  waitAndInspect: z.boolean().default(false).optional(), // New Checkbox Flag
});

type ExpenseBulkFormValues = z.infer<typeof expenseBulkFormSchema>;

interface FieldMetaData {
  api_name: string;
  display_name: string;
  data_type: string;
  is_custom_field: boolean;
  required: boolean;
}

const SERVER_URL = 'http://localhost:3000';

interface ExpenseBulkFormProps {
  socket: Socket | null;
  selectedProfileName: string;
  setSelectedProfileName: (name: string) => void;
  jobs: { [key: string]: ExpenseJobState };
  setJobs: React.Dispatch<React.SetStateAction<{ [key: string]: ExpenseJobState }>>;
}

export const ExpenseBulkForm: React.FC<ExpenseBulkFormProps> = ({ socket, selectedProfileName, setSelectedProfileName, jobs, setJobs }) => {
  const { toast } = useToast();
  const [moduleApiName, setModuleApiName] = useState('expenses'); // Default module
  const [moduleFields, setModuleFields] = useState<FieldMetaData[]>([]);

  // 1. Fetch Zoho Expense Fields for the current module (based on selectedProfileName)
  const fetchFields = async () => {
    if (!selectedProfileName) return null;
    
    // Request field metadata from the backend
    const response = await fetch(`${SERVER_URL}/api/profiles`);
    const profiles = await response.json();
    const activeProfile = profiles.find((p: any) => p.profileName === selectedProfileName);
    
    if (!activeProfile || !activeProfile.expense || !activeProfile.expense.moduleApiName) {
        setModuleFields([]);
        setModuleApiName('expenses'); // Reset to default or handle error
        return null;
    }
    
    const apiName = activeProfile.expense.moduleApiName;
    setModuleApiName(apiName);

    // Call API to get fields (via socket, triggering the handler)
    return new Promise<FieldMetaData[]>((resolve, reject) => {
        if (!socket) {
             setModuleFields([]);
             return reject(new Error("Socket not connected."));
        }
        
        socket.emit('getExpenseFields', { selectedProfileName });

        socket.once('expenseFieldsResult', (result: { success: boolean; fields?: FieldMetaData[]; error?: string }) => {
            if (result.success && result.fields) {
                setModuleFields(result.fields);
                resolve(result.fields);
            } else {
                setModuleFields([]);
                reject(new Error(result.error || "Failed to fetch module fields."));
            }
        });
    });
  };

  const { data: fieldsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenseFields', selectedProfileName],
    queryFn: fetchFields,
    enabled: !!selectedProfileName,
    refetchOnWindowFocus: false,
  });

  // 2. Initialize Form (using Zod resolver)
  const form = useForm<ExpenseBulkFormValues>({
    resolver: zodResolver(expenseBulkFormSchema),
    defaultValues: {
      selectedProfileName,
      selectedModuleApiName: moduleApiName,
      bulkIteratingFields: [],
      bulkDefaultData: {},
      bulkDelay: 1,
      waitAndInspect: false,
    },
    values: { // Ensures the profile name and module API name are updated when state changes
        selectedProfileName,
        selectedModuleApiName: moduleApiName,
        bulkIteratingFields: form.watch('bulkIteratingFields'),
        bulkDefaultData: form.watch('bulkDefaultData'),
        bulkDelay: form.watch('bulkDelay'),
        waitAndInspect: form.watch('waitAndInspect'),
    },
  });
  
  // Use useFieldArray for managing dynamic bulk fields (Creator-like smart form)
  const { fields: bulkFields, append: appendBulkField, remove: removeBulkField } = useFieldArray({
    control: form.control,
    name: "bulkIteratingFields"
  });

  // Effect to update form module name and reset bulk fields when profile/module changes
  useEffect(() => {
    form.setValue('selectedModuleApiName', moduleApiName);
    // Reset bulk iterating fields if module changes to prevent API name mismatch
    form.setValue('bulkIteratingFields', []);
  }, [moduleApiName, form]);


  // 3. Handle Form Submission
  const onSubmit = async (values: ExpenseBulkFormValues) => {
    if (!socket || !selectedProfileName) return;

    // Check if job is already running for this profile
    if (jobs[selectedProfileName]?.isProcessing) {
      toast({ title: "Job Already Running", description: "Please pause or end the current job first.", variant: 'destructive' });
      return;
    }
    
    // Estimate total number of records (length of the longest list)
    let maxRecords = 0;
    values.bulkIteratingFields.forEach(field => {
        const count = field.fieldValues.split('\n').filter(v => v.trim().length > 0).length;
        if (count > maxRecords) {
            maxRecords = count;
        }
    });

    if (maxRecords === 0) {
        toast({ title: "Error", description: "No values found for any bulk iterating field.", variant: 'destructive' });
        return;
    }
    
    // Prepare the new job state
    const newJobState: ExpenseJobState = {
        formData: {
            ...values,
            selectedModuleApiName: moduleApiName, // Ensure we use the latest from state
            moduleFields: moduleFields, 
        },
        results: [],
        isProcessing: true,
        isPaused: false,
        isComplete: false,
        processingStartTime: new Date(),
        processingTime: 0,
        totalToProcess: maxRecords,
        countdown: 0,
        currentDelay: values.bulkDelay,
        filterText: '',
    };

    setJobs(prev => ({ ...prev, [selectedProfileName]: newJobState }));

    // Send the bulk start command to the server
    socket.emit('startBulkCreateExpenseRecords', {
        selectedProfileName,
        formData: newJobState.formData,
        jobType: 'expense'
    });

    toast({
      title: "Bulk Job Started",
      description: `Starting to create ${maxRecords} Expense records for ${selectedProfileName}.`,
    });
  };
  
  // Filter fields to avoid internal ones
  const filteredFields = moduleFields.filter(f => !f.api_name.includes('_id') && f.api_name !== 'status' && f.api_name !== 'approval_status');

  // Fields already selected for iteration
  const usedBulkApiNames = form.watch('bulkIteratingFields').map(f => f.fieldApiName);
  
  // Filter fields available to be added as a new bulk field
  const availableBulkFields = filteredFields.filter(f => !usedBulkApiNames.includes(f.api_name));


  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Expense Record Creation</CardTitle>
        <CardDescription>
          Create multiple Expense records simultaneously using a selected Zoho Expense Module and defining bulk iteration fields.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <ProfileSelector 
                selectedProfileName={selectedProfileName}
                setSelectedProfileName={setSelectedProfileName}
                service="expense"
                apiNameOverride={moduleApiName}
            />

            <h3 className="text-lg font-semibold mt-6 flex items-center">
                Smart Bulk Fields (Creator-Like)
            </h3>
            <p className="text-sm text-muted-foreground">
                Define the fields whose values will be iterated for each record. List one value per line.
                The job duration is determined by the list with the maximum number of entries.
            </p>
            <Separator />
            
            {/* Dynamic Bulk Fields Section */}
            {bulkFields.map((field, index) => (
                <Card key={field.id} className="p-4 bg-muted/20 border-dashed">
                    <div className="flex justify-between items-start mb-4">
                        <h4 className="font-medium text-base">Bulk Field #{index + 1}</h4>
                        <Button 
                            type="button" 
                            variant="destructive" 
                            size="sm"
                            onClick={() => removeBulkField(index)}
                        >
                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                        </Button>
                    </div>
                    
                    <FormField
                        control={form.control}
                        name={`bulkIteratingFields.${index}.fieldApiName`}
                        render={({ field: selectField }) => (
                            <FormItem className="mb-4">
                                <FormLabel>Field to Iterate</FormLabel>
                                <Select
                                    onValueChange={(value) => {
                                        selectField.onChange(value);
                                        // Update the descriptive name when API name changes
                                        const selectedField = filteredFields.find(f => f.api_name === value);
                                        form.setValue(`bulkIteratingFields.${index}.fieldName`, selectedField?.display_name || '');
                                    }}
                                    value={selectField.value}
                                    disabled={isLoading || isError || !selectedProfileName}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select an Expense Field" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {/* Include previously selected field in dropdown, plus available ones */}
                                        {filteredFields.filter(f => f.api_name === selectField.value || !usedBulkApiNames.includes(f.api_name)).map(f => (
                                            <SelectItem key={f.api_name} value={f.api_name}>
                                                {f.display_name} ({f.data_type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    
                    <FormField
                        control={form.control}
                        name={`bulkIteratingFields.${index}.fieldValues`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Values (One per line)</FormLabel>
                                <FormControl>
                                    <Textarea rows={5} placeholder="Enter values, one per line (e.g., Expense A, Expense B, Expense C...)" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </Card>
            ))}
            
            {availableBulkFields.length > 0 && (
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                        // Append a new, empty bulk field array item
                        appendBulkField({ fieldApiName: '', fieldName: '', fieldValues: '' });
                    }}
                    className="w-full border-dashed"
                    disabled={isLoading || isError || !selectedProfileName}
                >
                    <Plus className="h-4 w-4 mr-2" /> Add Bulk Field
                </Button>
            )}
            
            {(isLoading || isError) && (
                 <p className="text-sm text-red-500">
                    {isLoading ? <Loader2 className="h-4 w-4 inline mr-2 animate-spin" /> : ''}
                    {isLoading ? 'Loading Expense fields...' : isError ? 'Error loading fields. Check profile configuration.' : ''}
                 </p>
            )}

            <h3 className="text-lg font-semibold mt-8">Default Field Values</h3>
            <p className="text-sm text-muted-foreground">
                Set constant values for fields that are not part of the iteration.
            </p>
            <Separator />

            {/* Default Field Values Section (simplified, assuming all non-iterating fields are constant) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredFields
                    .filter(f => !usedBulkApiNames.includes(f.api_name))
                    .map(field => (
                        <FormField
                            key={field.api_name}
                            control={form.control}
                            name={`bulkDefaultData.${field.api_name}`}
                            render={({ field: inputField }) => (
                                <FormItem>
                                    <FormLabel>{field.display_name} <span className="text-xs text-muted-foreground">({field.data_type})</span></FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={`Enter default value for ${field.display_name}`}
                                            {...inputField}
                                            value={inputField.value || ''}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))
                }
            </div>

            <h3 className="text-lg font-semibold mt-8">Job Configuration</h3>
            <Separator />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                    control={form.control}
                    name="bulkDelay"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Delay between calls (seconds)</FormLabel>
                            <FormControl>
                                <Input type="number" min="1" placeholder="1" {...field} onChange={e => field.onChange(e.target.value)} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* NEW: Wait & Inspect Log Checkbox */}
                <FormField
                    control={form.control}
                    name="waitAndInspect"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 col-span-2">
                            <div className="space-y-0.5">
                                <FormLabel className="text-base flex items-center">
                                    Wait & Inspect Log 
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Search className="ml-2 h-4 w-4 text-primary cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            <p>
                                                Enables Zoho Desk-like two-step verification. The job will wait for the specified delay 
                                                after creation, then check the Expense API again for final status 
                                                (e.g., to catch records rejected by internal automations).
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </FormLabel>
                                <FormDescription>
                                    Check API status after creation to verify automations pass.
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            <Button type="submit" className="w-full" disabled={!selectedProfileName || bulkFields.length === 0 || isLoading || jobs[selectedProfileName]?.isProcessing}>
              <Plus className="h-4 w-4 mr-2" /> Start Bulk Expense Creation
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};