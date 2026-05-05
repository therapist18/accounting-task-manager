// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Type definitions for better type safety
interface CategorySettings {
  clientStatus: Record<string, boolean>;
  sectionStatus?: Record<string, boolean>;
  operationalStatus?: Record<string, boolean>;
}

interface FilterState {
  categories: Record<string, boolean>;
  categorySettings: Record<string, CategorySettings>;
}

interface ClientCategoryFilterProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onFilterChange: (filters: FilterState) => void;
  showSectionName?: string;
  initialFilters?: FilterState | null;
  showSectionStatus?: boolean;
  showOperationalStatus?: boolean;
  hideCategoryFilterButton?: boolean;
}

export default function ClientCategoryFilter({
  open: propOpen,
  onOpenChange: propOnOpenChange,
  onFilterChange,
  showSectionName,
  initialFilters = null,
  showSectionStatus = true,
  showOperationalStatus = false,
  hideCategoryFilterButton = false
}: ClientCategoryFilterProps) {
  // Internal state for managing the dialog when not controlled
  const [internalOpen, setInternalOpen] = useState(false);

  // Use props if provided, otherwise use internal state
  const open = propOpen !== undefined ? propOpen : internalOpen;
  const onOpenChange = propOnOpenChange || setInternalOpen;

  const categories = ['All Categories', 'ACC', 'IMM', 'Audit', 'Sheria'];
  const clientStatuses = ['All', 'Active', 'Inactive (terminated)'];
  const sectionStatuses = ['All', 'Active', 'Inactive', 'Missing'];
  const operationalStatuses = ['All', 'Operational', 'Ceased'];

  // Maintain filter state between dialog openings
  const [filters, setFilters] = useState({
    categories: {},
    categorySettings: {}
  });

  // Initialize filters only once or when explicitly reset
  useEffect(() => {
    // Only initialize on first render, not on every dialog open
    if (initialFilters) {
      setFilters(initialFilters);
    } else if (Object.keys(filters.categories).length === 0) {
      // Default initial state if no filters exist yet
      const defaultFilters: FilterState = {
        categories: {
          'All Categories': false,
          'ACC': true,
          'IMM': false,
          'Audit': false,
          'Sheria': false
        },
        categorySettings: {
          'ACC': {
            clientStatus: {
              All: false,
              Active: true,
              'Inactive (terminated)': false
            },
            ...(showSectionStatus && {
              sectionStatus: { All: false, Active: true, Inactive: false, Missing: false }
            }),
            ...(showOperationalStatus && {
              operationalStatus: { All: false, Operational: true, Ceased: false }
            })
          }
        }
      };
      setFilters(defaultFilters);
      if (onFilterChange) onFilterChange(defaultFilters);
    }
  }, []);

  const handleCategoryChange = (category: string) => {
    const newCategories = { ...filters.categories };
    const newCategorySettings = { ...filters.categorySettings };

    // Handle "All Categories" special case
    if (category === 'All Categories') {
      const isNowSelected = !newCategories['All Categories'];
      newCategories['All Categories'] = isNowSelected;
      categories.forEach(cat => {
        if (cat !== 'All Categories') {
          newCategories[cat] = isNowSelected;
          if (isNowSelected && !newCategorySettings[cat]) {
            newCategorySettings[cat] = {
              clientStatus: { All: true, Active: true, 'Inactive (terminated)': true },
              ...(showSectionStatus && {
                sectionStatus: { All: true, Active: true, Inactive: true, Missing: true }
              }),
              ...(showOperationalStatus && {
                operationalStatus: { All: true, Operational: true, Ceased: true }
              })
            };
          }
        }
      });
    } else {
      // Standard toggle logic for specific categories
      const isSelected = !newCategories[category];
      newCategories[category] = isSelected;
      newCategories['All Categories'] = false;

      // Initialize settings for newly selected category
      if (isSelected && !newCategorySettings[category]) {
        newCategorySettings[category] = {
          clientStatus: { All: false, Active: true, 'Inactive (terminated)': false },
          ...(showSectionStatus && {
            sectionStatus: { All: false, Active: true, Inactive: false, Missing: false }
          }),
          ...(showOperationalStatus && {
            operationalStatus: { All: false, Operational: true, Ceased: false }
          })
        };
      }
    }

    const newFilters: FilterState = {
      categories: newCategories,
      categorySettings: newCategorySettings
    };

    setFilters(newFilters);
    if (onFilterChange) onFilterChange(newFilters);
  };

  const handleStatusChange = (category: string, type: 'client' | 'section' | 'operational', status: string) => {
    if (!filters.categories[category]) return;

    const newCategorySettings = { ...filters.categorySettings };

    // Initialize this category's settings if they don't exist
    if (!newCategorySettings[category]) {
      newCategorySettings[category] = {
        clientStatus: {},
        ...(showSectionStatus && { sectionStatus: {} }),
        ...(showOperationalStatus && { operationalStatus: {} })
      };
    }

    let statusKey: keyof CategorySettings;
    let statusOptions: string[];

    if (type === 'client') {
      statusKey = 'clientStatus';
      statusOptions = clientStatuses;
    } else if (type === 'section' && showSectionStatus) {
      statusKey = 'sectionStatus';
      statusOptions = sectionStatuses;
    } else if (type === 'operational' && showOperationalStatus) {
      statusKey = 'operationalStatus';
      statusOptions = operationalStatuses;
    } else {
      return; // Invalid type or status not shown
    }

    const currentSettings = { ...newCategorySettings[category][statusKey] };

    // Handle "All" status logic
    if (status === 'All') {
      const allSelected = !currentSettings['All'];
      // Toggle all options to match the "All" state
      statusOptions.forEach(st => {
        currentSettings[st] = allSelected;
      });
    } else {
      // Toggle the specific status
      currentSettings[status] = !currentSettings[status];
      // Check if all specific statuses are selected
      const allSpecificSelected = statusOptions.slice(1).every(st => currentSettings[st]);
      currentSettings['All'] = allSpecificSelected;
      // If none are selected, ensure at least one is
      const anySelected = statusOptions.slice(1).some(st => currentSettings[st]);
      if (!anySelected) {
        currentSettings[status] = true; // Keep the last one selected
      }
    }

    newCategorySettings[category][statusKey] = currentSettings;

    const newFilters: FilterState = {
      ...filters,
      categorySettings: newCategorySettings
    };

    setFilters(newFilters);
    if (onFilterChange) onFilterChange(newFilters);
  };

  const getCellChecked = (category: string, type: 'client' | 'section' | 'operational', status: string): boolean => {
    if (!filters.categories[category]) return false;

    // Get this category's settings (initialize if needed)
    const categorySettings = filters.categorySettings[category] || {
      clientStatus: {},
      ...(showSectionStatus && { sectionStatus: {} }),
      ...(showOperationalStatus && { operationalStatus: {} })
    };

    let statusKey: keyof CategorySettings;
    if (type === 'client') {
      statusKey = 'clientStatus';
    } else if (type === 'section' && showSectionStatus) {
      statusKey = 'sectionStatus';
    } else if (type === 'operational' && showOperationalStatus) {
      statusKey = 'operationalStatus';
    } else {
      return false;
    }

    return !!categorySettings[statusKey]?.[status];
  };

  const clearAll = () => {
    const emptyFilters: FilterState = {
      categories: {},
      categorySettings: {}
    };
    setFilters(emptyFilters);
    if (onFilterChange) onFilterChange(emptyFilters);
  };

  // Toggle the dialog
  const toggleDialog = (open: boolean) => {
    if (onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalOpen(open);
    }
  };

  // Only render the dialog content if open is true
  const dialogContent = open ? (
    <DialogContent className="max-w-5xl">
      <DialogHeader className="flex-shrink-0 rounded-t-xl">
        <div className="flex items-center gap-5">
          <div className="h-10 w-10 rounded-full flex items-center justify-center shadow-2xl ring-2 ring-slate-500/20">
            <Filter className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle className="text-2xl font-bold">Client Category Filter</DialogTitle>
            <DialogDescription className="">Filter companies by category and status.</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-blue-500 text-white p-2 border text-sm">Client Category</TableHead>
              <TableHead className="bg-blue-500 text-white p-2 border text-sm text-center" colSpan={3}>Client Status</TableHead>
              {showSectionStatus && (
                <TableHead className="bg-blue-500 text-white p-2 border text-sm text-center" colSpan={4}>{showSectionName} (Section)</TableHead>
              )}
              {showOperationalStatus && (
                <TableHead className="bg-blue-500 text-white p-2 border text-sm text-center" colSpan={4}>Operational Status</TableHead>
              )}
            </TableRow>
            <TableRow>
              <TableHead className="bg-blue-500 text-white p-2 border text-sm"></TableHead>
              {clientStatuses.map(status => (
                <TableHead key={`client-${status}`} className="bg-blue-500 text-white p-2 border text-sm text-center">{status}</TableHead>
              ))}
              {showSectionStatus && sectionStatuses.map(status => (
                <TableHead key={`section-${status}`} className="bg-blue-500 text-white p-2 border text-sm text-center">{status}</TableHead>
              ))}
              {showOperationalStatus && operationalStatuses.map(status => (
                <TableHead key={`operational-${status}`} className="bg-blue-500 text-white p-2 border text-sm text-center">{status}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(category => (
              <TableRow key={category} className="hover:bg-blue-50">
                <TableCell className="p-2 border bg-gray-50">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={!!filters.categories[category]}
                      onCheckedChange={() => handleCategoryChange(category)}
                    />
                    <label
                      htmlFor={`category-${category}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {category}
                    </label>
                  </div>
                </TableCell>

                {clientStatuses.map(status => (
                  <TableCell key={`${category}-client-${status}`} className="p-2 border text-center">
                    <Checkbox
                      id={`${category}-client-${status}`}
                      checked={getCellChecked(category, 'client', status)}
                      onCheckedChange={() => handleStatusChange(category, 'client', status)}
                      disabled={!filters.categories[category]}
                    />
                  </TableCell>
                ))}

                {showSectionStatus && sectionStatuses.map(status => (
                  <TableCell key={`${category}-section-${status}`} className="p-2 border text-center">
                    <Checkbox
                      id={`${category}-section-${status}`}
                      checked={getCellChecked(category, 'section', status)}
                      onCheckedChange={() => handleStatusChange(category, 'section', status)}
                      disabled={!filters.categories[category]}
                    />
                  </TableCell>
                ))}

                {showOperationalStatus && operationalStatuses.map(status => (
                  <TableCell key={`${category}-operational-${status}`} className="p-2 border text-center">
                    <Checkbox
                      id={`${category}-operational-${status}`}
                      checked={getCellChecked(category, 'operational', status)}
                      onCheckedChange={() => handleStatusChange(category, 'operational', status)}
                      disabled={!filters.categories[category]}
                    />
                  </TableCell>
                ))}

              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end mt-6 gap-2">
          <Button variant="destructive" onClick={clearAll}>
            Clear All
          </Button>
        </div>
      </div>
    </DialogContent>
  ) : null;

  // If hideCategoryFilterButton is true, only render the dialog
  if (hideCategoryFilterButton) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {dialogContent}
      </Dialog>
    );
  }

  // Otherwise, render the button and dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10" onClick={() => toggleDialog(true)}>
          <Filter className="mr-2 h-4 w-4" />
          Categories
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
