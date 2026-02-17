import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, FsmContactJobs, FsmContactJobState } from "@/App";
import { FsmDashboard } from "@/components/dashboard/fsm/FsmDashboard"; 

interface BulkContactsProps {
  jobs: FsmContactJobs;
  setJobs: React.Dispatch<React.SetStateAction<FsmContactJobs>>;
  socket: Socket | null;
  createInitialJobState: () => FsmContactJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkContacts = (props: BulkContactsProps) => {
  return (
    <FsmDashboard {...props} /> 
  );
};

export default BulkContacts;