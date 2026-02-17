import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, CatalystJobs, CatalystJobState } from "@/App";
import { CatalystDashboard } from "@/components/dashboard/catalyst/CatalystDashboard";

interface BulkSignupProps {
  jobs: CatalystJobs;
  setJobs: React.Dispatch<React.SetStateAction<CatalystJobs>>;
  socket: Socket | null;
  createInitialJobState: () => CatalystJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkSignup = (props: BulkSignupProps) => {
  return (
    <CatalystDashboard 
      {...props}
      service="catalyst" // <-- ADD THIS LINE
    />
  );
};

export default BulkSignup;