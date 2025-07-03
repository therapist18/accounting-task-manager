// @ts-nocheck
import React, { memo } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Plus, Minus } from 'lucide-react';
import { TruncatedText } from './TruncatedText';
import { DocumentType, Subdepartment } from '../types';

interface DocumentRowProps {
  document: DocumentType;
  isExpanded: boolean;
  subdepartments: Subdepartment[];
  documentAllocations: Record<string, boolean>;
  submittingIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleAllocation: (
    allocationId: string, 
    subdeptId: number, 
    classIndex: number, 
    subclassIndex: number | null, 
    checked: boolean
  ) => void;
  getSubmittingStatus: (
    allocationId: string, 
    subdeptId: number, 
    classIndex: number, 
    subclassIndex: number | null
  ) => boolean;
}

export const DocumentRow = memo(({
  document,
  isExpanded,
  subdepartments,
  documentAllocations,
  submittingIds,
  onToggleItem,
  onToggleAllocation,
  getSubmittingStatus
}: DocumentRowProps) => {
  return (
    <TableRow key={document.id} className="hover:bg-gray-50">
      <TableCell className="sticky left-0 bg-white border-r z-[5] w-16">
        <div className="flex items-center justify-center">
          {document.hasFields && (
            <button
              onClick={() => onToggleItem(document.id)}
              className="p-1 rounded hover:bg-gray-100"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="sticky left-16 bg-white border-r z-[5] w-[300px]">
        <div className="flex items-center gap-2 px-4 py-2">
          <FileText className="h-4 w-4 text-gray-500" />
          <TruncatedText 
            text={document.display_name || document.name} 
            className="font-medium text-gray-900"
            maxLength={40}
          />
        </div>
      </TableCell>
      
      {/* Allocation checkboxes */}
      {subdepartments.map((subdept, subIndex) => {
        if (!subdept.hasClasses || !subdept.classes?.length) {
          // Handle subdepartments without classes
          const isSubmitting = getSubmittingStatus(document.id, subdept.id, 0, null);
          const isChecked = documentAllocations[`${document.id}_${subdept.id}_0`] || false;
          
          return (
            <TableCell 
              key={`cell-${document.id}-${subdept.id}`} 
              className={`border-r text-center ${subIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => 
                    onToggleAllocation(document.id, subdept.id, 0, null, checked === true)
                  }
                  disabled={isSubmitting}
                  className="h-4 w-4"
                />
              </div>
            </TableCell>
          );
        }
        
        // Handle subdepartments with classes and subclasses
        return subdept.classes.flatMap((cls, clsIndex) => {
          if (!cls.subclasses?.length) {
            const isSubmitting = getSubmittingStatus(document.id, subdept.id, clsIndex, null);
            const isChecked = documentAllocations[`${document.id}_${subdept.id}_${clsIndex}`] || false;
            
            return (
              <TableCell 
                key={`cell-${document.id}-${subdept.id}-${clsIndex}`}
                className={`border-r text-center ${subIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => 
                      onToggleAllocation(document.id, subdept.id, clsIndex, null, checked === true)
                    }
                    disabled={isSubmitting}
                    className="h-4 w-4"
                  />
                </div>
              </TableCell>
            );
          }
          
          // Handle subclasses
          return cls.subclasses.map((subcls, subclsIndex) => {
            const isSubmitting = getSubmittingStatus(document.id, subdept.id, clsIndex, subclsIndex);
            const isChecked = documentAllocations[`${document.id}_${subdept.id}_${clsIndex}_${subclsIndex}`] || false;
            
            return (
              <TableCell 
                key={`cell-${document.id}-${subdept.id}-${clsIndex}-${subclsIndex}`}
                className={`border-r text-center ${subIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => 
                      onToggleAllocation(document.id, subdept.id, clsIndex, subclsIndex, checked === true)
                    }
                    disabled={isSubmitting}
                    className="h-4 w-4"
                  />
                </div>
              </TableCell>
            );
          });
        });
      })}
    </TableRow>
  );
});

DocumentRow.displayName = 'DocumentRow';
