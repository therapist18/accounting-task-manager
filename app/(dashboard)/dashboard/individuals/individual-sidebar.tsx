'use client'

import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, User, Search, ChevronsUpDown, Eye, EyeOff, Star, RotateCcw, Settings, ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import React from "react"

type Individual = {
  id: string | number;
  full_name: string;
  email?: string;
  phone?: string;
  id_number?: string;
  status?: string;
  default_display?: boolean;
  order?: number;
}

interface IndividualSidebarProps {
  individuals: Individual[];
  activeIndividual: string;
  onIndividualClick: (individualId: string) => void;
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  showDefaultDisplayOnly?: boolean;
  onToggleDefaultDisplay?: () => void;
}

// Helper component to render index with individual-specific colors
const IndividualIndexBadge = ({
  index,
  isActive,
  isDefault = false
}: {
  index: string;
  isActive: boolean;
  isDefault?: boolean;
}) => {
  return (
    <span className={cn(
      "flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium mr-2 flex-shrink-0 transition-all",
      isActive 
        ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-200" 
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
    )}>
      {index}
    </span>
  )
}

// Helper component for truncated text with tooltip and individual-specific styling
const IndividualTruncatedText = ({
  text,
  className = "",
  isActive = false,
  isDefault = false
}: {
  text: string;
  className?: string;
  isActive?: boolean;
  isDefault?: boolean;
}) => {
  const textColor = isActive && isDefault 
    ? "text-emerald-800 dark:text-emerald-100" 
    : isActive 
      ? "text-emerald-700 dark:text-emerald-100" 
      : isDefault 
        ? "text-emerald-600 dark:text-emerald-200" 
        : "text-gray-700 dark:text-gray-200"

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 min-w-0">
            <span className={`block whitespace-nowrap ${textColor} ${className}`}>
              {text}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Helper function to filter individuals by default display
const filterIndividualsByDefaultDisplay = <T extends { default_display?: boolean }>(items: T[], showDefaultOnly: boolean): T[] => {
  if (!showDefaultOnly) return items
  return items.filter(item => item.default_display === true)
}

// Helper function to check if individual should be visible based on default display filter
const shouldShowIndividual = (individual: { default_display?: boolean }, showDefaultOnly: boolean): boolean => {
  if (!showDefaultOnly) return true
  return individual.default_display === true
}

export function IndividualSidebar({
  individuals,
  activeIndividual,
  onIndividualClick,
  isCollapsed = false,
  onCollapseToggle,
  showDefaultDisplayOnly = false,
  onToggleDefaultDisplay = () => { },
}: IndividualSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  // Count default display items
  const defaultDisplayCounts = React.useMemo(() => {
    let totalDefault = 0
    let totalItems = 0

    individuals.forEach(individual => {
      totalItems++
      if (individual.default_display) totalDefault++
    })

    return { totalDefault, totalItems }
  }, [individuals])

  const filteredIndividuals = React.useMemo(() => {
    let inds = individuals

    // 1. Apply ordering
    inds = inds.sort((a, b) => (a.order || 0) - (b.order || 0))

    // 2. Apply default display filter
    if (showDefaultDisplayOnly) {
      inds = inds.filter(individual => shouldShowIndividual(individual, showDefaultDisplayOnly))
    }

    // 3. Apply search filter
    if (!searchQuery.trim()) return inds

    const query = searchQuery.toLowerCase()
    return inds.filter(individual =>
      individual.full_name.toLowerCase().includes(query) ||
      (individual.email && individual.email.toLowerCase().includes(query)) ||
      (individual.phone && individual.phone.toLowerCase().includes(query)) ||
      (individual.id_number && individual.id_number.toLowerCase().includes(query))
    )
  }, [individuals, searchQuery, showDefaultDisplayOnly])

  if (isCollapsed) {
    return (
      <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 py-4 items-center">
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col items-center gap-4 w-full px-2">
            <Button variant="ghost" size="icon" onClick={onCollapseToggle} className="h-8 w-8 text-gray-400">
              <ChevronRight size={18} />
            </Button>
            <Separator className="w-8" />
            {filteredIndividuals.map((individual) => (
              <Tooltip key={individual.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeIndividual === individual.id.toString() ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => onIndividualClick(individual.id.toString())}
                    className={cn(
                      "h-10 w-10 rounded-xl shrink-0 transition-all",
                      activeIndividual === individual.id.toString()
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <User size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{individual.full_name}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
              <User className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Individuals</h3>
          </div>

          <div className="flex items-center gap-1">
            {/* Add Collapse Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapseToggle}
              className="h-8 w-8 text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft size={18} />
            </Button>

            {/* Default Display Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDefaultDisplayOnly ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 px-2 text-xs",
                      showDefaultDisplayOnly
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                    onClick={onToggleDefaultDisplay}
                  >
                    {showDefaultDisplayOnly ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">
                    {showDefaultDisplayOnly ? 'Show All Items' : 'Show Default Only'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {defaultDisplayCounts.totalDefault} of {defaultDisplayCounts.totalItems} items marked as default
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Settings/Info Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" side="bottom" align="end">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-2">Display Settings</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Total Individuals:</span>
                        <Badge variant="outline">{defaultDisplayCounts.totalItems}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Default Display:</span>
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Star className="h-3 w-3 mr-1" />
                          {defaultDisplayCounts.totalDefault}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Currently Showing:</span>
                        <Badge variant="outline">
                          {showDefaultDisplayOnly ? defaultDisplayCounts.totalDefault : defaultDisplayCounts.totalItems}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <p className="text-xs text-gray-500">
                      Items marked with ★ are set as default display. Use the eye icon to toggle between showing all items or only default items.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search individuals..."
            className="pl-9 h-9 text-sm rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-1 focus-visible:ring-emerald-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Status */}
        {(showDefaultDisplayOnly || searchQuery) && (
          <div className="flex items-center gap-2 flex-wrap">
            {showDefaultDisplayOnly && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1" />
                Default Only
              </Badge>
            )}
            {searchQuery && (
              <Badge variant="outline" className="text-xs">
                <Search className="h-3 w-3 mr-1" />
                "{searchQuery}"
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredIndividuals.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? (
              <div>
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No individuals found for "{searchQuery}"</p>
              </div>
            ) : showDefaultDisplayOnly ? (
              <div>
                <Star className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No default display items found</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={onToggleDefaultDisplay}
                >
                  Show All Items
                </Button>
              </div>
            ) : (
              <div>
                <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No individuals found</p>
              </div>
            )}
          </div>
        ) : (
          filteredIndividuals.map((individual, index) => {
            const isActive = activeIndividual === individual.id.toString()

            return (
              <div key={individual.id} className="space-y-1">
                <button
                  className={cn(
                    "w-full flex items-center justify-between p-3 text-left transition-all duration-200 group relative rounded-lg",
                    isActive
                      ? individual.default_display
                        ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-100 font-medium shadow-sm border border-emerald-200"
                        : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-100 font-medium shadow-sm"
                      : individual.default_display
                        ? "bg-emerald-50/50 dark:bg-emerald-900/20 text-gray-700 dark:text-gray-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  )}
                  onClick={() => onIndividualClick(individual.id.toString())}
                >
                  <div className="flex items-center space-x-2">
                    <IndividualIndexBadge
                      index={`${index + 1}`}
                      isActive={isActive}
                      isDefault={individual.default_display === true}
                    />
                    <div className="flex-1 min-w-0">
                      <IndividualTruncatedText
                        text={individual.full_name}
                        className="font-medium text-sm"
                        isActive={isActive}
                        isDefault={individual.default_display === true}
                      />
                      {individual.email && (
                        <IndividualTruncatedText
                          text={individual.email}
                          className="text-xs text-gray-500 dark:text-gray-400"
                          isActive={isActive}
                          isDefault={individual.default_display === true}
                        />
                      )}
                    </div>
                  </div>
                  {individual.status && (
                    <Badge 
                      variant={individual.status === 'active' ? 'default' : 'secondary'} 
                      className="h-5 text-xs"
                    >
                      {individual.status}
                    </Badge>
                  )}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer with stats when filtering */}
      {showDefaultDisplayOnly && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Showing default display items</span>
            <Badge variant="outline" className="text-xs">
              <Star className="h-3 w-3 mr-1" />
              {defaultDisplayCounts.totalDefault} / {defaultDisplayCounts.totalItems}
            </Badge>
          </div>
        </div>
      )}
    </div>
  )
}
