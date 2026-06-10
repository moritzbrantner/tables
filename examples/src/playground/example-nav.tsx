import { Button } from "@moritzbrantner/ui";

import { exampleLinks, type ExamplePage } from "./model";

export function ExampleNav({ page }: { page: ExamplePage }) {
  return (
    <nav aria-label="Examples navigation" className="example-nav">
      {exampleLinks.map((link) => {
        const active = page === link.id;

        return (
          <Button
            aria-current={active ? "page" : undefined}
            asChild
            key={link.id}
            size="sm"
            variant={active ? "default" : "outline"}
          >
            <a href={link.href}>{link.label}</a>
          </Button>
        );
      })}
    </nav>
  );
}
