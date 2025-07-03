import React, { memo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

export const TruncatedText = memo(({ text, maxLength = 30, className = '' }: TruncatedTextProps) => {
  if (!text) return null;
  
  const truncated = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;

  if (text.length <= maxLength) {
    return <span className={className}>{text}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`cursor-help ${className}`}>{truncated}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px] break-words">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TruncatedText.displayName = 'TruncatedText';
