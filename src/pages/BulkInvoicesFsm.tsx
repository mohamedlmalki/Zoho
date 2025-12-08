import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, FsmInvoiceJobs, FsmInvoiceJobState } from "@/App";
import { FsmInvoiceDashboard } from "@/components/dashboard/fsm/FsmInvoiceDashboard"; 

interface BulkInvoicesFsmProps {
  jobs: FsmInvoiceJobs;
  setJobs: React.Dispatch<React.SetStateAction<FsmInvoiceJobs>>;
  socket: Socket | null;
  createInitialJobState: () => FsmInvoiceJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkInvoicesFsm = (props: BulkInvoicesFsmProps) => {
  return (
    <FsmInvoiceDashboard {...props} /> 
  );
};

export default BulkInvoicesFsm;