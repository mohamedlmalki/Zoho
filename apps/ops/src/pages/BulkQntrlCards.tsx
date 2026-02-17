import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, QntrlJobs, QntrlJobState } from "@/App";
import { QntrlDashboard } from "@/components/dashboard/qntrl/QntrlDashboard"; 

interface BulkQntrlCardsProps {
  jobs: QntrlJobs;
  setJobs: React.Dispatch<React.SetStateAction<QntrlJobs>>;
  socket: Socket | null;
  createInitialJobState: () => QntrlJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkQntrlCards = (props: BulkQntrlCardsProps) => {
  return (
    <QntrlDashboard 
      {...props}
      service="qntrl" // <-- ADD THIS LINE
    /> 
  );
};

export default BulkQntrlCards;