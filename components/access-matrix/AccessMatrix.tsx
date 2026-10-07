"use client";

// The permissions matrix, in BCL Registry's User Rights design: one row per role (or per
// selected user), one column per permission grouped under its category banner, a "Select all"
// header row, and tri-state cells (ticked = all, dash = only some of a role's users, empty = none).
// Shared by Task Manager, KRA Tools and BCL Meetings (components/access-matrix) — keep the copies in sync.

import { useMemo, type ReactNode } from "react";
import { DataTable, type DTColumn } from "./DataTable";
import { MatrixCheckbox } from "./ui";
import { theme } from "./theme";

export type CellState = "all" | "some" | "none";

export interface MatrixPermission {
  key: string;
  label: string;
  /** Category banner the column sits under. */
  group: string;
}

export interface MatrixSection {
  id: string;
  label: string;
  /** e.g. "12 users" or the user's role, shown under the label. */
  detail?: string;
  /** Locked rows (Super Admin, or a role nobody has). */
  readOnly?: boolean;
}

interface AccessMatrixProps {
  title: string;
  sectionHeader: string;
  sections: MatrixSection[];
  permissions: MatrixPermission[];
  getCell: (sectionId: string, key: string) => CellState;
  isSaving?: (sectionId: string, key: string) => boolean;
  onChange: (sectionId: string, key: string, value: boolean) => void;
  /** Header "Select all" for a column, across every editable row. */
  onSelectColumn: (key: string, value: boolean) => void;
  loading?: boolean;
  onRefresh?: () => void | Promise<void>;
  actions?: ReactNode;
  toolbarExtra?: ReactNode;
  pageSize?: number;
}

const STATE_TEXT: Record<CellState, string> = { all: "Yes", some: "Some", none: "No" };

export function AccessMatrix({
  title,
  sectionHeader,
  sections,
  permissions,
  getCell,
  isSaving,
  onChange,
  onSelectColumn,
  loading = false,
  onRefresh,
  actions,
  toolbarExtra,
  pageSize = 25,
}: AccessMatrixProps) {
  const columns = useMemo<DTColumn<MatrixSection>[]>(
    () => [
      {
        id: "__section",
        header: sectionHeader,
        sticky: true,
        width: 220,
        searchable: true,
        text: (row) => (row.detail ? `${row.label} (${row.detail})` : row.label),
        accessor: (row) => (
          <div className="flex flex-col leading-tight">
            <span className={`truncate ${theme.sectionLabel}`}>{row.label}</span>
            {row.detail && <span className={`truncate ${theme.sectionDetail}`}>{row.detail}</span>}
          </div>
        ),
      },
      ...permissions.map<DTColumn<MatrixSection>>((permission) => ({
        id: permission.key,
        header: permission.label,
        group: permission.group,
        align: "center",
        width: 120,
        text: (row) => STATE_TEXT[getCell(row.id, permission.key)],
        accessor: (row) => {
          const state = getCell(row.id, permission.key);
          return (
            <div className="flex justify-center" title={state === "some" ? "Only some users have this" : undefined}>
              <MatrixCheckbox
                checked={state === "all"}
                indeterminate={state === "some"}
                disabled={row.readOnly || isSaving?.(row.id, permission.key)}
                onChange={(value) => onChange(row.id, permission.key, value)}
                label={`${row.label}: ${permission.label}`}
              />
            </div>
          );
        },
      })),
    ],
    [sectionHeader, permissions, getCell, isSaving, onChange]
  );

  const renderSelectAll = (column: DTColumn<MatrixSection>) => {
    if (column.id === "__row_number") return null;
    if (column.id === "__section") return <span className="font-semibold">Select all</span>;
    const editable = sections.filter((s) => !s.readOnly);
    const states = editable.map((s) => getCell(s.id, column.id));
    const allOn = states.length > 0 && states.every((s) => s === "all");
    const anyOn = states.some((s) => s !== "none");
    return (
      <div className="flex justify-center">
        <MatrixCheckbox
          checked={allOn}
          indeterminate={!allOn && anyOn}
          disabled={loading || editable.length === 0 || editable.some((s) => isSaving?.(s.id, column.id))}
          onChange={(value) => onSelectColumn(column.id, value)}
          label={`Select all for ${column.header}`}
        />
      </div>
    );
  };

  return (
    <DataTable
      title={title}
      columns={columns}
      data={sections}
      getRowId={(row) => row.id}
      loading={loading}
      searchPlaceholder="Search..."
      toolbarExtra={toolbarExtra}
      actions={actions}
      onRefresh={onRefresh}
      pageSize={pageSize}
      headerControls={renderSelectAll}
      showRowNumber
      emptyMessage="Nothing to show."
    />
  );
}
