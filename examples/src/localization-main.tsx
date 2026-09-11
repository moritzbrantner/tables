import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  VirtualTable,
  type TableColumn,
  type TableMessageOverrides,
} from "@moritzbrantner/tables";
import "../../styles.css";
import "./styles.css";

type Language = "de" | "en" | "es";
type Theme = "dark" | "light";
type Row = {
  id: number;
  city: string;
  owner: string;
  status: "Active" | "Paused";
};

const rows: Row[] = [
  { id: 1, city: "München", owner: "Åsa", status: "Active" },
  { id: 2, city: "Ciudad de México", owner: "Íñigo", status: "Paused" },
  { id: 3, city: "İzmir", owner: "Çağla", status: "Active" },
  { id: 4, city: "Zürich", owner: "Zoë", status: "Paused" },
  { id: 5, city: "São Paulo", owner: "Álvaro", status: "Active" },
];

const columns: TableColumn<Row>[] = [
  {
    accessor: "city",
    filterable: true,
    header: "City",
    id: "city",
    resizable: true,
    sortable: true,
    width: 220,
  },
  {
    accessor: "owner",
    filterable: true,
    header: "Owner",
    id: "owner",
    resizable: true,
    sortable: true,
    width: 180,
  },
  {
    accessor: "status",
    filterOptions: ["Active", "Paused"],
    filterable: true,
    header: "Status",
    id: "status",
    resizable: true,
    sortable: true,
    width: 160,
  },
];

const germanMessages: TableMessageOverrides = {
  apply: "Anwenden",
  booleanFalse: "Falsch",
  booleanTrue: "Wahr",
  clearAllFilters: "Alle Filter löschen",
  clearFilter: "Filter löschen",
  clearSort: (label) => `Sortierung für ${label} löschen`,
  columnActions: (label) => `Spaltenaktionen für ${label}`,
  columns: "Spalten",
  emptyState: "Keine Zeilen",
  filter: "Filter",
  filterColumn: (label) => `${label} filtern`,
  filterOperators: {
    between: "Zwischen",
    contains: "Enthält",
    endsWith: "Endet mit",
    equals: "Ist gleich",
    gt: "Größer als",
    gte: "Größer oder gleich",
    in: "Ist in",
    isNotNull: "Ist nicht leer",
    isNull: "Ist leer",
    lt: "Kleiner als",
    lte: "Kleiner oder gleich",
    notEquals: "Ist nicht gleich",
    startsWith: "Beginnt mit",
  },
  from: "Von",
  loadingState: "Zeilen werden geladen",
  moveColumnDown: (label) => `${label} nach unten verschieben`,
  moveColumnUp: (label) => `${label} nach oben verschieben`,
  openColumnActions: (label) => `Spaltenaktionen für ${label} öffnen`,
  openTableOptions: "Tabellenoptionen öffnen",
  resetOrder: "Reihenfolge zurücksetzen",
  resizeColumn: (label) => `${label} Größe ändern`,
  selectValue: "Wert auswählen",
  showAllColumns: "Alle Spalten anzeigen",
  sortAscending: (label) => `${label} aufsteigend sortieren`,
  sortDescending: (label) => `${label} absteigend sortieren`,
  tableAriaLabel: "Datentabelle",
  tableOptions: "Tabellenoptionen",
  to: "Bis",
  value: "Wert",
};

const spanishMessages: TableMessageOverrides = {
  apply: "Aplicar",
  booleanFalse: "Falso",
  booleanTrue: "Verdadero",
  clearAllFilters: "Borrar todos los filtros",
  clearFilter: "Borrar filtro",
  clearSort: (label) => `Borrar orden de ${label}`,
  columnActions: (label) => `Acciones de columna para ${label}`,
  columns: "Columnas",
  emptyState: "Sin filas",
  filter: "Filtro",
  filterColumn: (label) => `Filtrar ${label}`,
  filterOperators: {
    between: "Entre",
    contains: "Contiene",
    endsWith: "Termina con",
    equals: "Igual a",
    gt: "Mayor que",
    gte: "Mayor o igual que",
    in: "En",
    isNotNull: "No está vacío",
    isNull: "Está vacío",
    lt: "Menor que",
    lte: "Menor o igual que",
    notEquals: "Distinto de",
    startsWith: "Empieza con",
  },
  from: "Desde",
  loadingState: "Cargando filas",
  moveColumnDown: (label) => `Mover ${label} hacia abajo`,
  moveColumnUp: (label) => `Mover ${label} hacia arriba`,
  openColumnActions: (label) => `Abrir acciones de columna para ${label}`,
  openTableOptions: "Abrir opciones de tabla",
  resetOrder: "Restablecer orden",
  resizeColumn: (label) => `Cambiar tamaño de ${label}`,
  selectValue: "Seleccionar valor",
  showAllColumns: "Mostrar todas las columnas",
  sortAscending: (label) => `Ordenar ${label} ascendente`,
  sortDescending: (label) => `Ordenar ${label} descendente`,
  tableAriaLabel: "Tabla de datos",
  tableOptions: "Opciones de tabla",
  to: "Hasta",
  value: "Valor",
};

const messages: Record<Language, TableMessageOverrides | undefined> = {
  de: germanMessages,
  en: undefined,
  es: spanishMessages,
};

function LocalizationExample() {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.demoTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.lang = language;
    return () => {
      delete document.documentElement.dataset.demoTheme;
    };
  }, [language, theme]);

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="site-header__brand" href="./">@moritzbrantner/tables</a>
        <a href="./">Back to examples</a>
      </header>

      <section className="hero">
        <p>Localization, semantic themes, and touch</p>
        <h1>Host-owned presentation</h1>
        <p>
          Table mechanics remain neutral while applications inject table-owned copy, locale-aware
          client comparison, semantic theme variables, and narrow-layout containment.
        </p>
      </section>

      <section className="content-grid">
        <div className="localization-controls" data-testid="localization-controls">
          <label className="search-control">
            <span>Language</span>
            <select
              aria-label="Language"
              className="demo-select"
              onChange={(event) => setLanguage(event.currentTarget.value as Language)}
              value={language}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label className="search-control">
            <span>Theme</span>
            <select
              aria-label="Theme"
              className="demo-select"
              onChange={(event) => setTheme(event.currentTarget.value as Theme)}
              value={theme}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button className="demo-button" onClick={() => setNarrow((value) => !value)} type="button">
            {narrow ? "Use full width" : "Use narrow width"}
          </button>
        </div>

        <div
          className={`localization-preview${narrow ? " localization-preview--narrow" : ""}`}
          data-testid="localization-preview"
        >
          <VirtualTable
            columnMenu
            columnResizing
            columns={columns}
            height={360}
            locale={language}
            messages={messages[language]}
            rowKey="id"
            rows={rows}
            selectionMode="multiple"
            showRowIndex
            striped
          />
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <LocalizationExample />
  </StrictMode>,
);
