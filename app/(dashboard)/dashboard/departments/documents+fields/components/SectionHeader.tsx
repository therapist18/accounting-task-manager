//@ts-nocheck
import React from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  icon?: React.ComponentType;
  count?: number;
  className?: string;
}

export function SectionHeader({ 
  title, 
  icon: Icon = FileText, 
  count = 0,
  className = '' 
}: SectionHeaderProps) {
  return (
    <div className={cn(
      'flex items-center justify-between p-4 border-b border-gray-200',
      className
    )}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      {count > 0 && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {count} items
        </span>
      )}
    </div>
  );
}
