export type ExamplePage = "dense" | "examples" | "states" | "wide";

export type TableDensity = "comfortable" | "compact";

export type PipelineRow = {
  account: string;
  amount: number;
  health: "At risk" | "Healthy" | "Watch";
  id: string;
  owner: string;
  probability: number;
  region: string;
  renewalDate: Date;
  segment: "Commercial" | "Enterprise" | "Mid-market" | "Startup";
  stage: "Closed" | "Negotiation" | "Proposal" | "Renewal";
  updatedAt: Date;
};

export type CustomerRow = {
  account: string;
  activeUsers: number;
  arr: number;
  billingCycle: "Annual" | "Monthly" | "Quarterly";
  contractValue: number;
  country: string;
  csm: string;
  id: string;
  lastLoginAt: Date;
  openTickets: number;
  owner: string;
  plan: "Business" | "Enterprise" | "Scale" | "Starter";
  productFit: "High" | "Low" | "Medium";
  region: string;
  renewalDate: Date;
  riskScore: number;
  segment: "Commercial" | "Enterprise" | "Mid-market" | "Startup";
  seats: number;
  status: "Active" | "Expanding" | "Onboarding" | "Paused";
  usage: number;
};

export type AuditRow = {
  action: "Approved" | "Exported" | "Flagged" | "Imported" | "Reviewed";
  actor: string;
  id: string;
  occurredAt: Date;
  resource: string;
  status: "Failed" | "Queued" | "Succeeded";
};

export const exampleLinks = [
  { id: "examples", href: "./", label: "Overview" },
  { id: "dense", href: "./dense.html", label: "Dense data" },
  { id: "wide", href: "./wide.html", label: "Wide table" },
  { id: "states", href: "./states.html", label: "States" },
] satisfies Array<{ id: ExamplePage; href: string; label: string }>;
