import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../demo-ui";

type TablePanelProps = {
  children: ReactNode;
  description?: string;
  title: string;
};

export function TablePanel({ children, description, title }: TablePanelProps) {
  return (
    <Card className="table-panel">
      <CardHeader>
        <CardTitle level={2}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="table-panel__content">{children}</CardContent>
    </Card>
  );
}
