// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { X, Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ClientCategoryFilterProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onFilterChange: (filters: any) => void;
  showSectionName?: string;
  initialFilters?: any;
  showSectionStatus?: boolean;
  hideCategoryFilterButton?: boolean;
}

export default function ClientCategoryFilter({ 
  open: propOpen, 
  onOpenChange: propOnOpenChange, 
  onFilterChange, 
  showSectionName, 
  initialFilters = null,
  showSectionStatus = true,
  hideCategoryFilterButton = false
}: ClientCategoryFilterProps) {
  // Internal state for managing the dialog when not controlled
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use props if provided, otherwise use internal state
  const open = propOpen !== undefined ? propOpen : internalOpen;
  const onOpenChange = propOnOpenChange || setInternalOpen;

  const categories = ['All Categories', 'ACC', 'IMM', 'Sheria', 'Audit']; 
  const clientStatuses = ['All', 'Active', 'Inactive'];
  const sectionStatuses = ['All', 'Active', 'Inactive', 'Missing'];

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
      const defaultFilters = {
        categories: {
          'All Categories': false,
          'Acc': true,
          'Imm': false,
          'Sheria': false,
          'Audit': false
        },
        categorySettings: {
          'Acc': {
            clientStatus: { 
              All: false, 
              Active: true, 
              Inactive: false 
            },
            sectionStatus: { 
              All: false, 
              Active: true, 
              Inactive: false, 
              Missing: false 
            }
          }
        }
      };
      setFilters(defaultFilters);
      if (onFilterChange) onFilterChange(defaultFilters);
    }
  }, []);

// In ClientCategoryFilter.tsx, update the handleCategoryChange function
const handleCategoryChange = (category) => {
  console.log("Category changed:", category);
  const newCategories = { ...filters.categories };
  const newCategorySettings = { ...filters.categorySettings }; 
  
  // Handle "All Categories" special case
  if (category === 'All Categories') {
    const allSelected = !newCategories['All Categories'];
    
    // If selecting "All Categories", select all categories
    if (allSelected) {
      categories.forEach(cat => {
        newCategories[cat] = true;
        // Initialize settings for each category
        if (!newCategorySettings[cat] && cat !== 'All Categories') {
          newCategorySettings[cat] = {
            clientStatus: { 
              All: false,
              Active: true,
              Inactive: false
            },
            sectionStatus: {
              All: true,
              Active: true,
              Inactive: false,
              Missing: false
            }
          };
        }
      });
    } else {
      // Just toggle "All Categories" off if it's already on
      newCategories['All Categories'] = false;
    }
  } else {
    // If a specific category is toggled
    const isSelected = !newCategories[category];
    
    // Uncheck "All Categories" when selecting a specific one
    newCategories['All Categories'] = false;
    newCategories[category] = isSelected;
    
    // Initialize status settings for a newly selected category
    if (isSelected) {
      newCategorySettings[category] = {
        clientStatus: { 
          All: false,
          Active: true,  // Auto-select Active by default
          Inactive: false
        },
        sectionStatus: {
          All: true,     // Auto-select All section statuses by default
          Active: true,
          Inactive: false,
          Missing: false
        }
      };
    }
  }
  
  const newFilters = { 
    categories: newCategories, 
    categorySettings: newCategorySettings 
  };
  
  setFilters(newFilters);
  console.log("Selected categories:", Object.entries(newFilters.categories)
    .filter(([_, isSelected]) => isSelected)
    .map(([category]) => category));
    
  if (onFilterChange) onFilterChange(newFilters);
};

  // Handle status changes for a specific category
  const handleStatusChange = (category, type, status) => {
    if (!filters.categories[category]) return;
    
    const newCategorySettings = { ...filters.categorySettings };
    
    // Initialize this category's settings if they don't exist
    if (!newCategorySettings[category]) {
      newCategorySettings[category] = {
        clientStatus: {},
        sectionStatus: {}
      };
    }
    
    const statusKey = type === 'client' ? 'clientStatus' : 'sectionStatus';
    const statusOptions = type === 'client' ? clientStatuses : sectionStatuses;
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
    
    const newFilters = { 
      ...filters, 
      categorySettings: newCategorySettings 
    };
    
    setFilters(newFilters);
    if (onFilterChange) onFilterChange(newFilters);
  };

  // Get the checked state for a cell based on its category and status
  const getCellChecked = (category, type, status) => {
    if (!filters.categories[category]) return false;
    
    // Get this category's settings (initialize if needed)
    const categorySettings = filters.categorySettings[category] || {
      clientStatus: {},
      sectionStatus: {}
    };
    
    const statusKey = type === 'client' ? 'clientStatus' : 'sectionStatus';
    return !!categorySettings[statusKey][status];
  };

  // Clear all filters
  const clearAll = () => {
    const emptyFilters = {
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
    <DialogContent className="sm:max-w-[800px]">
      <DialogHeader className="mb-4">
        <DialogTitle className="text-xl font-bold">Client Category Filter</DialogTitle>
      </DialogHeader>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-blue-500 text-white p-2 border">Client Category</th>
                <th className="bg-blue-500 text-white p-2 border text-center" colSpan={3}>Client Status</th>
                {showSectionStatus && (
                  <th className="bg-blue-500 text-white p-2 border text-center" colSpan={4}>{showSectionName} (Section)</th>
                )}
              </tr>
              <tr>
                <th className="bg-blue-500 text-white p-2 border"></th>
                {clientStatuses.map(status => (
                  <th key={`client-${status}`} className="bg-blue-500 text-white p-2 border text-center">{status}</th>
                ))}
                {showSectionStatus && sectionStatuses.map(status => (
                  <th key={`section-${status}`} className="bg-blue-500 text-white p-2 border text-center">{status}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(category => (
                <tr key={category} className="hover:bg-gray-100">
                  <td className="p-2 border">
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
                  </td>
                  
                  {clientStatuses.map(status => (
                    <td key={`${category}-client-${status}`} className="p-2 border text-center">
                      <Checkbox 
                        id={`${category}-client-${status}`}
                        checked={getCellChecked(category, 'client', status)}
                        onCheckedChange={() => handleStatusChange(category, 'client', status)}
                        disabled={!filters.categories[category]}
                      />
                    </td>
                  ))}
                  
                  {showSectionStatus && sectionStatuses.map(status => (
                    <td key={`${category}-section-${status}`} className="p-2 border text-center">
                      <Checkbox 
                        id={`${category}-section-${status}`}
                        checked={getCellChecked(category, 'section', status)}
                        onCheckedChange={() => handleStatusChange(category, 'section', status)}
                        disabled={!filters.categories[category]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
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
          Co Categories
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}