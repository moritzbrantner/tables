import { exampleLinks, type ExamplePage } from "./model";

export function getExamplePage(): ExamplePage {
  const pathname = window.location.pathname.replace(/\/$/, "");
  const filename = pathname.split("/").pop() ?? "";

  if (!filename || filename === "index.html") {
    return "examples";
  }

  const page = exampleLinks.find((link) => filename === link.href.replace("./", ""));

  return page?.id ?? "examples";
}
