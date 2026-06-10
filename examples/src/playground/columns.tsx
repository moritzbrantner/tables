import type { TableColumn } from "@moritzbrantner/tables";
import { Badge, type BadgeProps } from "@moritzbrantner/ui";

import { formatCurrency, formatDate, formatPercent } from "./data";
import type { AuditRow, CustomerRow, PipelineRow } from "./model";

export const pipelineColumns: TableColumn<PipelineRow>[] = [
  { accessor: "id", header: "ID", id: "id", sortable: true, width: 116 },
  { accessor: "account", header: "Account", id: "account", sortable: true, width: 240 },
  { accessor: "owner", header: "Owner", id: "owner", sortable: true, width: 144 },
  { accessor: "region", header: "Region", id: "region", sortable: true, width: 148 },
  { accessor: "segment", header: "Segment", id: "segment", sortable: true, width: 152 },
  { accessor: "stage", header: "Stage", id: "stage", sortable: true, width: 148 },
  {
    accessor: "amount",
    align: "end",
    cell: (value) => formatCurrency(Number(value)),
    header: "Amount",
    id: "amount",
    sortable: true,
    width: 144,
  },
  {
    accessor: "probability",
    align: "end",
    cell: (value) => formatPercent(Number(value)),
    header: "Probability",
    id: "probability",
    sortable: true,
    width: 136,
  },
  {
    accessor: "health",
    cell: (value) => <StatusBadge value={String(value)} />,
    header: "Health",
    id: "health",
    sortable: true,
    width: 136,
  },
  {
    accessor: "updatedAt",
    cell: (value) => (value instanceof Date ? formatDate(value) : ""),
    header: "Updated",
    id: "updatedAt",
    sortAccessor: (row) => row.updatedAt,
    sortable: true,
    width: 148,
  },
  {
    accessor: "renewalDate",
    cell: (value) => (value instanceof Date ? formatDate(value) : ""),
    header: "Renewal",
    id: "renewalDate",
    sortAccessor: (row) => row.renewalDate,
    sortable: true,
    width: 148,
  },
];

export const customerColumns: TableColumn<CustomerRow>[] = [
  { accessor: "id", header: "ID", id: "id", sortable: true, width: 112 },
  { accessor: "account", header: "Account", id: "account", sortable: true, width: 240 },
  {
    accessor: "status",
    cell: (value) => <StatusBadge value={String(value)} />,
    header: "Status",
    id: "status",
    sortable: true,
    width: 132,
  },
  { accessor: "plan", header: "Plan", id: "plan", sortable: true, width: 128 },
  { accessor: "segment", header: "Segment", id: "segment", sortable: true, width: 152 },
  { accessor: "region", header: "Region", id: "region", sortable: true, width: 152 },
  { accessor: "country", header: "Country", id: "country", sortable: true, width: 164 },
  { accessor: "owner", header: "Owner", id: "owner", sortable: true, width: 136 },
  { accessor: "csm", header: "CSM", id: "csm", sortable: true, width: 136 },
  {
    accessor: "arr",
    align: "end",
    cell: (value) => formatCurrency(Number(value)),
    header: "ARR",
    id: "arr",
    sortable: true,
    width: 132,
  },
  {
    accessor: "contractValue",
    align: "end",
    cell: (value) => formatCurrency(Number(value)),
    header: "Contract",
    id: "contractValue",
    sortable: true,
    width: 144,
  },
  { accessor: "seats", align: "end", header: "Seats", id: "seats", sortable: true, width: 112 },
  {
    accessor: "activeUsers",
    align: "end",
    header: "Active users",
    id: "activeUsers",
    sortable: true,
    width: 136,
  },
  {
    accessor: "usage",
    align: "end",
    cell: (value) => formatPercent(Number(value)),
    header: "Usage",
    id: "usage",
    sortable: true,
    width: 116,
  },
  {
    accessor: (row) => `${row.riskScore}/100`,
    align: "end",
    header: "Risk",
    id: "riskScore",
    sortAccessor: (row) => row.riskScore,
    sortable: true,
    width: 104,
  },
  {
    accessor: "openTickets",
    align: "end",
    header: "Tickets",
    id: "openTickets",
    sortable: true,
    width: 112,
  },
  { accessor: "billingCycle", header: "Billing", id: "billingCycle", sortable: true, width: 128 },
  { accessor: "productFit", header: "Fit", id: "productFit", sortable: true, width: 112 },
  {
    accessor: "renewalDate",
    cell: (value) => (value instanceof Date ? formatDate(value) : ""),
    header: "Renewal",
    id: "renewalDate",
    sortAccessor: (row) => row.renewalDate,
    sortable: true,
    width: 148,
  },
  {
    accessor: "lastLoginAt",
    cell: (value) => (value instanceof Date ? formatDate(value) : ""),
    header: "Last login",
    id: "lastLoginAt",
    sortAccessor: (row) => row.lastLoginAt,
    sortable: true,
    width: 148,
  },
];

export const auditColumns: TableColumn<AuditRow>[] = [
  { accessor: "id", header: "ID", id: "id", sortable: true, width: 112 },
  { accessor: "resource", header: "Resource", id: "resource", sortable: true, width: 240 },
  { accessor: "actor", header: "Actor", id: "actor", sortable: true, width: 144 },
  { accessor: "action", header: "Action", id: "action", sortable: true, width: 136 },
  {
    accessor: "status",
    cell: (value) => <StatusBadge value={String(value)} />,
    header: "Status",
    id: "status",
    sortable: true,
    width: 132,
  },
  {
    accessor: "occurredAt",
    cell: (value) => (value instanceof Date ? formatDate(value) : ""),
    header: "Occurred",
    id: "occurredAt",
    sortAccessor: (row) => row.occurredAt,
    sortable: true,
    width: 148,
  },
];

function StatusBadge({ value }: { value: string }) {
  return <Badge variant={getStatusVariant(value)}>{value}</Badge>;
}

function getStatusVariant(value: string): BadgeProps["variant"] {
  if (["At risk", "Failed", "Low", "Paused"].includes(value)) {
    return "destructive";
  }

  if (["Healthy", "Active", "Expanding", "Succeeded", "High"].includes(value)) {
    return "default";
  }

  return "secondary";
}
