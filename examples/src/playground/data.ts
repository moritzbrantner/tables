import type { AuditRow, CustomerRow, PipelineRow } from "./model";

const accounts = [
  "Acme Robotics",
  "Atlas Supply",
  "Blue Harbor",
  "Brightline Energy",
  "Cobalt Systems",
  "Evergreen Labs",
  "Helio Foods",
  "Northstar Bank",
  "Orbit Retail",
  "Signal Works",
  "Summit Health",
  "Vector Motors",
];
const owners = ["A. Weber", "C. Novak", "M. Klein", "S. Fischer", "T. Hansen", "L. Brandt"];
const customerSuccess = ["N. Kaya", "P. Rossi", "R. Moore", "V. Chen", "Y. Singh"];
const regions = ["DACH", "Benelux", "Nordics", "Iberia", "North America", "APAC"];
const countries = ["Germany", "Netherlands", "Sweden", "Spain", "United States", "Singapore"];
const stages: PipelineRow["stage"][] = ["Proposal", "Negotiation", "Renewal", "Closed"];
const healthValues: PipelineRow["health"][] = ["Healthy", "Watch", "At risk"];
const segments: PipelineRow["segment"][] = ["Startup", "Commercial", "Mid-market", "Enterprise"];
const plans: CustomerRow["plan"][] = ["Starter", "Business", "Scale", "Enterprise"];
const statuses: CustomerRow["status"][] = ["Active", "Expanding", "Onboarding", "Paused"];
const billingCycles: CustomerRow["billingCycle"][] = ["Monthly", "Quarterly", "Annual"];
const productFitValues: CustomerRow["productFit"][] = ["High", "Medium", "Low"];
const auditActions: AuditRow["action"][] = ["Imported", "Reviewed", "Approved", "Exported", "Flagged"];
const auditStatuses: AuditRow["status"][] = ["Succeeded", "Queued", "Failed"];

export function createPipelineRows(count: number): PipelineRow[] {
  return Array.from({ length: count }, (_, index) => {
    const account = accounts[index % accounts.length];
    const amount = 1200 + ((index * 7919) % 420000);

    return {
      account: `${account} ${String(Math.floor(index / accounts.length) + 1).padStart(4, "0")}`,
      amount,
      health: healthValues[(index + Math.floor(amount / 50000)) % healthValues.length],
      id: `PIPE-${String(index + 1).padStart(6, "0")}`,
      owner: owners[index % owners.length],
      probability: 0.18 + (((index * 17) % 78) / 100),
      region: regions[index % regions.length],
      renewalDate: new Date(Date.UTC(2026, (index + 3) % 12, (index % 28) + 1)),
      segment: segments[index % segments.length],
      stage: stages[index % stages.length],
      updatedAt: new Date(Date.UTC(2026, index % 12, (index % 28) + 1)),
    };
  });
}

export function createCustomerRows(count: number): CustomerRow[] {
  return Array.from({ length: count }, (_, index) => {
    const seats = 8 + ((index * 13) % 980);
    const usage = ((index * 37) % 101) / 100;
    const riskScore = (index * 29) % 100;

    return {
      account: `${accounts[(index * 3) % accounts.length]} ${String(index + 1).padStart(5, "0")}`,
      activeUsers: Math.round(seats * (0.35 + usage * 0.58)),
      arr: 6000 + ((index * 9973) % 900000),
      billingCycle: billingCycles[index % billingCycles.length],
      contractValue: 9000 + ((index * 6781) % 1200000),
      country: countries[index % countries.length],
      csm: customerSuccess[index % customerSuccess.length],
      id: `CUS-${String(index + 1).padStart(6, "0")}`,
      lastLoginAt: new Date(Date.UTC(2026, (index + 5) % 12, (index % 28) + 1)),
      openTickets: (index * 7) % 18,
      owner: owners[index % owners.length],
      plan: plans[index % plans.length],
      productFit: productFitValues[(index + riskScore) % productFitValues.length],
      region: regions[index % regions.length],
      renewalDate: new Date(Date.UTC(2026, (index + 8) % 12, (index % 28) + 1)),
      riskScore,
      seats,
      segment: segments[index % segments.length],
      status: statuses[index % statuses.length],
      usage,
    };
  });
}

export function createAuditRows(count: number): AuditRow[] {
  return Array.from({ length: count }, (_, index) => ({
    action: auditActions[index % auditActions.length],
    actor: owners[index % owners.length],
    id: `AUD-${String(index + 1).padStart(5, "0")}`,
    occurredAt: new Date(Date.UTC(2026, index % 12, (index % 28) + 1, index % 24, (index * 7) % 60)),
    resource: `${accounts[index % accounts.length]} workspace`,
    status: auditStatuses[index % auditStatuses.length],
  }));
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatCompact(value: number): string {
  return Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

export function formatPercent(value: number): string {
  return Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}
