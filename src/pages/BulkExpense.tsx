// src/pages/BulkExpense.tsx
import React from 'react';
import { Socket } from "socket.io-client";
import { Profile, ExpenseJobs, ExpenseJobState } from "@/App";
import { ExpenseDashboard } from "@/components/dashboard/expense/ExpenseDashboard";

interface BulkExpenseProps {
  jobs: ExpenseJobs;
  setJobs: React.Dispatch<React.SetStateAction<ExpenseJobs>>;
  socket: Socket | null;
  createInitialJobState: () => ExpenseJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const BulkExpense = (props: BulkExpenseProps) => {
  return <ExpenseDashboard {...props} />;
};

export default BulkExpense;