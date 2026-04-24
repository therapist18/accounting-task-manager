"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobQuestion } from "../types";

interface JobQuestionPickerProps {
  jobQuestions: JobQuestion[];
  selectedQuestionId?: string;
  onSelect: (question: JobQuestion) => void;
  onClear?: () => void;
  placeholder?: string;
  allowMultiple?: boolean;
  selectedQuestionIds?: string[];
  onMultipleSelect?: (questionIds: string[]) => void;
  className?: string;
}

export function JobQuestionPicker({
  jobQuestions,
  selectedQuestionId,
  onSelect,
  onClear,
  placeholder = "Select job question...",
  allowMultiple = false,
  selectedQuestionIds = [],
  onMultipleSelect,
  className = ""
}: JobQuestionPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const selectedQuestion = useMemo(() =>
    jobQuestions.find(q => q.id === selectedQuestionId),
    [jobQuestions, selectedQuestionId]);

  const selectedQuestions = useMemo(() =>
    jobQuestions.filter(q => selectedQuestionIds.includes(q.id)),
    [jobQuestions, selectedQuestionIds]);

  const filteredQuestions = useMemo(() => {
    if (!search) return jobQuestions;
    const searchLower = search.toLowerCase();
    
    return jobQuestions.map(question => {
      if (question.type === 'field_group' && question.sub_questions?.length) {
        const groupMatches = question.label.toLowerCase().includes(searchLower) ||
                           question.type.toLowerCase().includes(searchLower);
        
        const matchingSubQuestions = question.sub_questions.filter(sub => 
          sub.label.toLowerCase().includes(searchLower) ||
          sub.type.toLowerCase().includes(searchLower)
        );
        
        if (groupMatches || matchingSubQuestions.length > 0) {
          return {
            ...question,
            sub_questions: groupMatches ? question.sub_questions : matchingSubQuestions,
            _hasMatchingSubQuestions: matchingSubQuestions.length > 0 && !groupMatches
          };
        }
        
        return null;
      }
      
      const matches = question.label.toLowerCase().includes(searchLower) ||
                     question.type.toLowerCase().includes(searchLower);
      
      return matches ? question : null;
    }).filter(Boolean) as (JobQuestion & { _hasMatchingSubQuestions?: boolean })[];
  }, [jobQuestions, search]);

  const renderQuestionItem = (question: JobQuestion, isSubQuestion = false) => {
    const isSelected = allowMultiple 
      ? selectedQuestionIds.includes(question.id)
      : selectedQuestionId === question.id;
    const indentClass = isSubQuestion ? 'pl-6' : '';
    const iconClass = isSubQuestion ? '📄' : question.type === 'field_group' ? '📁' : '📝';
    const textClass = isSubQuestion ? 'text-sm text-slate-600' : question.type === 'field_group' ? 'font-semibold text-purple-700' : 'font-medium';
    
    return (
      <CommandItem
        key={question.id}
        value={question.label}
        onSelect={() => {
          if (allowMultiple && onMultipleSelect) {
            const currentIds = [...selectedQuestionIds];
            if (isSelected) {
              onMultipleSelect(currentIds.filter(id => id !== question.id));
            } else {
              onMultipleSelect([...currentIds, question.id]);
            }
          } else {
            onSelect(question);
            setOpen(false);
          }
        }}
        className={`cursor-pointer ${indentClass}`}
      >
        <div className="flex items-center">
          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
            {isSelected && <Check className="h-3 w-3" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">{iconClass}</span>
            <div>
              <div className={textClass}>{question.label}</div>
              <div className="text-xs text-muted-foreground capitalize">{question.type}</div>
            </div>
          </div>
        </div>
      </CommandItem>
    );
  };

  const displayText = allowMultiple 
    ? selectedQuestions.length > 0 
      ? `${selectedQuestions.length} question${selectedQuestions.length > 1 ? 's' : ''} selected`
      : placeholder
    : selectedQuestion
      ? selectedQuestion.label
      : placeholder;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
              <span className="truncate">{displayText}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search job questions..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No job questions found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {filteredQuestions.map((question) => {
                    if (question.type === 'field_group' && question.sub_questions?.length) {
                      return (
                        <React.Fragment key={question.id}>
                          {renderQuestionItem(question)}
                          {question.sub_questions.map(subQuestion => 
                            renderQuestionItem(subQuestion, true)
                          )}
                        </React.Fragment>
                      );
                    }
                    return renderQuestionItem(question);
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {((!allowMultiple && selectedQuestion) || (allowMultiple && selectedQuestions.length > 0)) && onClear && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {allowMultiple && selectedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedQuestions.map(question => (
            <Badge
              key={question.id}
              variant="secondary"
              className="flex items-center gap-1.5 pr-1.5 bg-purple-50 text-purple-700 border-purple-200"
            >
              <HelpCircle className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{question.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMultipleSelect?.(selectedQuestionIds.filter(id => id !== question.id));
                }}
                className="ml-1 rounded-full p-0.5 hover:bg-purple-100"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {!allowMultiple && selectedQuestion && (
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 pr-1.5 bg-purple-50 text-purple-700 border-purple-200"
          >
            <HelpCircle className="h-3 w-3" />
            <span className="max-w-[200px] truncate">{selectedQuestion.label}</span>
          </Badge>
        </div>
      )}
    </div>
  );
}
