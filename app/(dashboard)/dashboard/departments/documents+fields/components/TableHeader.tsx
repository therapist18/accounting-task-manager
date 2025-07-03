// @ts-nocheck
"use client";
import React, { memo } from 'react';
import { TableHead, TableHeader as TableHeaderUI, TableRow } from '@/components/ui/table';
import { TruncatedText } from './TruncatedText';
import { Subdepartment } from '../types';

interface TableHeaderProps {
  subdepartments: Subdepartment[];
  getTotalColSpan: (subdept: Subdepartment) => number;
}

export const TableHeader = memo(({ subdepartments, getTotalColSpan }: TableHeaderProps) => {
  return (
    <TableHeader className="sticky top-0 bg-blue-600 z-10">
      {/* Main Header Row */}
      <TableRow>
        <TableHead 
          rowSpan={4} 
          className="sticky left-0 bg-blue-600 border-r border-blue-500 w-16 z-20 text-white text-center"
        >
          #
        </TableHead>
        <TableHead 
          rowSpan={4} 
          className="sticky left-16 bg-blue-600 border-r border-blue-500 w-[300px] z-20 text-white"
        >
          <div className="flex items-center justify-between px-4">
            <span className="truncate">Document / Field Details</span>
          </div>
        </TableHead>
        {subdepartments.map((subdept, subIndex) => {
          const colSpan = getTotalColSpan(subdept);
          const width = colSpan * 120;
          return (
            <TableHead
              key={`subdept-header-${subdept.id}`}
              colSpan={colSpan}
              style={{ width: `${width}px` }}
              className={cn(
                "border-r border-blue-400 px-2 text-center font-semibold text-white",
                subIndex % 2 === 0 ? "bg-blue-700" : "bg-blue-600"
              )}
            >
              <div className="flex items-center justify-center">
                <TruncatedText
                  text={subdept.name}
                  className="font-semibold text-white"
                  maxLength={15}
                />
              </div>
            </TableHead>
          );
        })}
      </TableRow>

      {/* Class Header Row */}
      <TableRow>
        {subdepartments.flatMap((subdept, subIndex) =>
          subdept.hasClasses ? (
            subdept.classes?.map((cls, clsIndex) => {
              const colSpan = cls.subclasses?.length || 1;
              const width = colSpan * 120;
              return (
                <TableHead
                  key={`class-header-${subdept.id}-${clsIndex}`}
                  colSpan={colSpan}
                  style={{ width: `${width}px` }}
                  className={cn(
                    "border-r border-blue-400 px-2 text-center text-white text-sm",
                    subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500"
                  )}
                >
                  <div className="flex items-center justify-center">
                    <TruncatedText
                      text={cls.name}
                      className="text-sm text-white"
                      maxLength={15}
                    />
                  </div>
                </TableHead>
              );
            })
          ) : (
            <TableHead
              key={`subdept-direct-${subdept.id}`}
              style={{ width: '120px' }}
              className={cn(
                "border-r border-blue-400 text-center text-white text-sm",
                subIndex % 2 === 0 ? "bg-blue-600" : "bg-blue-500"
              )}
            >
              -
            </TableHead>
          )
        )}
      </TableRow>

      {/* Subclass Header Row */}
      <TableRow>
        {subdepartments.flatMap((subdept, subIndex) =>
          subdept.hasClasses ? (
            subdept.classes?.flatMap((cls, clsIndex) =>
              cls.subclasses?.length ? (
                cls.subclasses.map((subcls, subclsIndex) => (
                  <TableHead
                    key={`subclass-header-${subdept.id}-${clsIndex}-${subclsIndex}`}
                    style={{ width: '120px' }}
                    className={cn(
                      "border-r border-blue-400 px-2 text-center text-white text-xs",
                      subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400"
                    )}
                  >
                    <div className="flex items-center justify-center">
                      <TruncatedText
                        text={subcls.name}
                        className="text-xs text-white"
                        maxLength={10}
                      />
                    </div>
                  </TableHead>
                ))
              ) : (
                <TableHead
                  key={`class-direct-${subdept.id}-${clsIndex}`}
                  style={{ width: '120px' }}
                  className={cn(
                    "border-r border-blue-400 text-center text-white text-xs",
                    subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400"
                  )}
                >
                  -
                </TableHead>
              )
            )
          ) : (
            <TableHead
              key={`subdept-main-${subdept.id}`}
              style={{ width: '120px' }}
              className={cn(
                "border-r border-blue-400 text-center text-white text-xs",
                subIndex % 2 === 0 ? "bg-blue-500" : "bg-blue-400"
              )}
            >
              -
            </TableHead>
          )
        )}
      </TableRow>

      {/* Display Header Row */}
      <TableRow>
        {subdepartments.flatMap((subdept, subIndex) =>
          subdept.hasClasses ? (
            subdept.classes?.flatMap((cls, clsIndex) =>
              cls.subclasses?.length ? (
                cls.subclasses.map((_, subclsIndex) => (
                  <TableHead
                    key={`d-h-${subdept.id}-${clsIndex}-${subclsIndex}`}
                    style={{ width: '120px' }}
                    className="border-r border-blue-400 px-2 text-center text-white text-xs bg-blue-300"
                  >
                    <div className="flex items-center justify-center">
                      <span className="truncate">Display</span>
                    </div>
                  </TableHead>
                ))
              ) : (
                <TableHead
                  key={`d-h-${subdept.id}-${clsIndex}`}
                  style={{ width: '120px' }}
                  className="border-r border-blue-400 text-center text-white text-xs bg-blue-300"
                >
                  Display
                </TableHead>
              )
            )
          ) : (
            <TableHead
              key={`d-h-${subdept.id}`}
              style={{ width: '120px' }}
              className="border-r border-blue-400 text-center text-white text-xs bg-blue-300"
            >
              Display
            </TableHead>
          )
        )}
      </TableRow>
    </TableHeader>
  );
});

TableHeader.displayName = 'TableHeader';

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
