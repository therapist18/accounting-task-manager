"use client";

// A compact data table matching BCL Registry's InformationTable look: toolbar (search, extras,
// actions, refresh, export), primary-coloured header with group banners, an optional header
// controls row (e.g. per-column "Select all"), sticky leading columns, zebra rows and the same
// paged footer. Shared by Task Manager, KRA Tools and BCL Meetings (components/access-matrix) — keep in sync.

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolbarButton } from "./ui";
import { theme } from "./theme";

export interface DTColumn<T> {
  id: string;
  header: string;
  /** Columns with the same group sit under one banner cell. */
  group?: string;
  accessor: (row: T) => ReactNode;
  /** Plain text for search and export (defaults to empty). */
  text?: (row: T) => string;
  align?: "left" | "center" | "right";
  /** Width in px; sticky columns use it as their fixed width. */
  width?: number;
  sticky?: boolean;
  searchable?: boolean;
}

interface DataTableProps<T> {
  title: string;
  columns: DTColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  searchPlaceholder?: string;
  toolbarExtra?: ReactNode;
  actions?: ReactNode;
  onRefresh?: () => void | Promise<void>;
  /** Rows per page; pass a multiple of a section's size to keep sections whole. */
  pageSize?: number;
  /** Background for a row (e.g. section header rows); defaults to zebra striping. */
  rowBackground?: (row: T, index: number) => string | undefined;
  /** One extra header row with a cell under every column (e.g. "Select all" controls). */
  headerControls?: (column: DTColumn<T>) => ReactNode;
  emptyMessage?: string;
  /** Adds a sticky "#" column numbering rows across pages (as in BCL Registry). */
  showRowNumber?: boolean;
}

const alignClass = (align?: "left" | "center" | "right") =>
  align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTable<T>({
  title,
  columns: dataColumns,
  data,
  getRowId,
  loading = false,
  searchPlaceholder = "Search...",
  toolbarExtra,
  actions,
  onRefresh,
  pageSize: initialPageSize = 50,
  rowBackground,
  headerControls,
  emptyMessage = "No records found.",
  showRowNumber = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    const searchable = dataColumns.filter((c) => c.searchable && c.text);
    return data.filter((row) => searchable.some((c) => c.text!(row).toLowerCase().includes(q)));
  }, [dataColumns, data, search]);

  // Row numbers follow the filtered order, so they stay sequential across pages.
  const columns = useMemo<DTColumn<T>[]>(() => {
    if (!showRowNumber) return dataColumns;
    const position = new Map(filtered.map((row, i) => [getRowId(row), i + 1]));
    return [
      {
        id: "__row_number",
        header: "#",
        sticky: true,
        width: 52,
        align: "center",
        text: (row) => String(position.get(getRowId(row)) ?? ""),
        accessor: (row) => <span className="tabular-nums text-muted-foreground">{position.get(getRowId(row))}</span>,
      },
      ...dataColumns,
    ];
  }, [showRowNumber, dataColumns, filtered, getRowId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  // Sticky columns stack from the left using their fixed widths.
  const stickyLeft = useMemo(() => {
    const offsets: Record<string, number> = {};
    let left = 0;
    for (const column of columns) {
      if (!column.sticky) continue;
      offsets[column.id] = left;
      left += column.width ?? 150;
    }
    return offsets;
  }, [columns]);

  const hasGroups = columns.some((c) => c.group);
  const segments = useMemo(() => {
    const out: ({ type: "single"; column: DTColumn<T> } | { type: "group"; group: string; columns: DTColumn<T>[] })[] = [];
    for (const column of columns) {
      const last = out[out.length - 1];
      if (column.group) {
        if (last?.type === "group" && last.group === column.group) last.columns.push(column);
        else out.push({ type: "group", group: column.group, columns: [column] });
      } else out.push({ type: "single", column });
    }
    return out;
  }, [columns]);

  const cellStyle = (column: DTColumn<T>) => ({
    width: column.width,
    minWidth: column.width,
    left: column.sticky ? stickyLeft[column.id] : undefined,
  });

  const headerCell = (column: DTColumn<T>, rowSpan?: number) => (
    <th
      key={column.id}
      rowSpan={rowSpan}
      style={cellStyle(column)}
      className={cn(
        theme.th,
        alignClass(column.align),
        column.sticky && "sticky z-20"
      )}
    >
      <span className="block truncate">{column.header}</span>
    </th>
  );

  const runRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const exportRows = () => {
    const headers = columns.map((c) => (c.group ? `${c.group} ${c.header}` : c.header));
    const rows = filtered.map((row) => columns.map((c) => (c.text ? c.text(row) : "")));
    return { headers, rows };
  };

  const exportCsv = () => {
    const { headers, rows } = exportRows();
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${title.toLowerCase().replace(/\s+/g, "-")}.csv`);
  };

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { headers, rows } = exportRows();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.addRow(headers);
    rows.forEach((r) => sheet.addRow(r));
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    });
    sheet.columns.forEach((col) => (col.width = 18));
    const buffer = await workbook.xlsx.writeBuffer();
    download(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${title.toLowerCase().replace(/\s+/g, "-")}.xlsx`
    );
  };

  // A window of up to 5 page buttons around the current page.
  const firstPageButton = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const pageButtons = Array.from({ length: Math.min(5, totalPages) }, (_, i) => firstPageButton + i);

  return (
    <div className={theme.tableWrap}>
      {/* Toolbar */}
      <div className={theme.toolbar}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={cn("relative w-full", theme.searchWidth)}>
            <Search className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground", theme.inputIcon)} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              className={theme.input}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {toolbarExtra && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{toolbarExtra}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRefresh && (
            <ToolbarButton onClick={runRefresh} disabled={refreshing}>
              <RotateCcw className={cn(refreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </ToolbarButton>
          )}
          <div className="relative">
            <ToolbarButton onClick={() => setExportOpen((o) => !o)} disabled={filtered.length === 0}>
              <Download />
              <span className="hidden sm:inline">Export as</span>
            </ToolbarButton>
            {exportOpen && (
              <div
                className="absolute right-0 z-50 mt-1 w-36 rounded-md border border-border bg-card p-1 shadow-lg"
                onMouseLeave={() => setExportOpen(false)}
              >
                {[
                  { label: "Excel (.xlsx)", run: exportExcel },
                  { label: "CSV (.csv)", run: exportCsv },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      void item.run();
                    }}
                    className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {actions}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        <table className="w-full min-w-max border-collapse text-left">
          <thead className="sticky top-0 z-30">
            {hasGroups ? (
              <>
                <tr className="bg-primary">
                  {segments.map((segment) =>
                    segment.type === "single" ? (
                      headerCell(segment.column, 2)
                    ) : (
                      <th
                        key={`group-${segment.group}-${segment.columns[0].id}`}
                        colSpan={segment.columns.length}
                        className={theme.thGroup}
                      >
                        {segment.group}
                      </th>
                    )
                  )}
                </tr>
                <tr className="bg-primary">{columns.filter((c) => c.group).map((c) => headerCell(c))}</tr>
              </>
            ) : (
              <tr className="bg-primary">{columns.map((c) => headerCell(c))}</tr>
            )}
            {headerControls && (
              <tr>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    style={cellStyle(column)}
                    className={cn(
                      theme.controlsCell,
                      alignClass(column.align),
                      column.sticky && "sticky z-20"
                    )}
                  >
                    {headerControls(column)}
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className={theme.empty}>
                  Loading...
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={theme.empty}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => {
                const bg = rowBackground?.(row, index) ?? (index % 2 === 0 ? theme.rowEven : theme.rowOdd);
                return (
                  <Fragment key={getRowId(row)}>
                    <tr className={cn("transition-colors", bg)}>
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          style={cellStyle(column)}
                          className={cn(
                            theme.td,
                            alignClass(column.align),
                            column.sticky && cn("sticky z-10", bg)
                          )}
                        >
                          <div className={cn("truncate", alignClass(column.align))}>{column.accessor(row)}</div>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className={theme.footer}>
        <div className="flex items-center gap-3">
          <p className={theme.footerText}>
            Showing <span className={theme.footerStrong}>{filtered.length > 0 ? start + 1 : 0}</span> to{" "}
            <span className={theme.footerStrong}>{Math.min(start + pageSize, filtered.length)}</span> of{" "}
            <span className={theme.footerStrong}>{filtered.length}</span>
          </p>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className={theme.footerSelect}
          >
            {Array.from(new Set([initialPageSize, 20, 50, 100, 200])).sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <ToolbarButton className={theme.pageArrow} onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>
            <ChevronLeft />
          </ToolbarButton>
          {pageButtons.map((n) => (
            <ToolbarButton
              key={n}
              tone={n === currentPage ? "primary" : "default"}
              className={theme.pageButton}
              onClick={() => setPage(n)}
            >
              {n}
            </ToolbarButton>
          ))}
          <ToolbarButton
            className={theme.pageArrow}
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight />
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}
