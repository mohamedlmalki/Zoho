import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, EmailJobs, EmailJobState } from "@/App";
import { EmailDashboard } from "@/components/dashboard/catalyst/EmailDashboard"; 

interface BulkEmailProps {
  jobs: EmailJobs;
  setJobs: React.Dispatch<React.SetStateAction<EmailJobs>>;
  socket: Socket | null;
  createInitialJobState: () => EmailJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkEmail = (props: BulkEmailProps) => {
  return (
    <EmailDashboard 
      {...props}
      service="catalyst" // <-- ADD THIS LINE
    /> 
  );
};

export default BulkEmail;