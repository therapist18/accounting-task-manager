"use client"

import React, { useState, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Eye, EyeOff, Settings, Building2, Folder, FileText } from "lucide-react"

interface NestedEntity extends EntityVisibilityOption {
  children?: NestedEntity[]
}

export interface EntityVisibilityOption {
  id: string
  name: string
  type: 'subdepartment' | 'class' | 'subclass'
  parentId?: string
  visible: boolean
  level: number
  path: string
  hasChildren?: boolean
  default_display?: boolean
}

interface EntityVisibilityControlProps {
  entities: EntityVisibilityOption[]
  onVisibilityChange: (entityId: string, visible: boolean) => void
  onShowAll?: () => void
  onHideAll?: () => void
  onResetToDefault?: () => void
  showDefaultDisplayOnly?: boolean
  onToggleDefaultDisplay?: () => void
  trigger?: React.ReactNode
  title?: string
  description?: string
}

export const EntityVisibilityControl: React.FC<EntityVisibilityControlProps> = React.memo(({
  entities,
  onVisibilityChange,
  onShowAll,
  onHideAll,
  onResetToDefault,
  showDefaultDisplayOnly,
  onToggleDefaultDisplay,
  trigger,
  title = "Entity Visibility",
  description = "Toggle visibility of departments, classes, and subclasses"
}) => {
  const [isOpen, setIsOpen] = useState(false)

  // Create nested entity structure
  const nestedEntities = useMemo((): NestedEntity[] => {
    const entityMap = new Map(entities.map(e => [e.id, e]))
    const rootEntities = entities.filter(e => e.type === 'subdepartment')

    const buildTree = (parentId?: string): NestedEntity[] => {
      return entities
        .filter(e => e.parentId === parentId)
        .map(entity => ({
          ...entity,
          children: buildTree(entity.id)
        }))
    }

    return rootEntities.map(subdept => ({
      ...subdept,
      children: buildTree(subdept.id)
    }))
  }, [entities])

  const visibleCount = useMemo(() => entities.filter(entity => entity.visible).length, [entities])
  const totalCount = entities.length

  const getIndentation = (level: number) => {
    return `pl-${Math.min(level * 4, 16)}`
  }

  const defaultTrigger = useMemo(() => (
    <Button variant="outline" size="sm" className="flex items-center gap-2">
      <Settings className="h-4 w-4" />
      Rows ({visibleCount}/{totalCount})
    </Button>
  ), [visibleCount, totalCount])

  const renderEntity = (entity: NestedEntity, level: number) => {
    return (
      <div
        key={entity.id}
        className={`flex items-center space-x-2 py-1 ${getIndentation(level)}`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id={entity.id}
              checked={entity.visible}
              onCheckedChange={(checked) => {
                onVisibilityChange(entity.id, Boolean(checked))
              }}
            />
            <Label
              htmlFor={entity.id}
              className="text-sm flex-1 cursor-pointer truncate"
              title={entity.path}
            >
              {entity.name}
              {entity.default_display !== false && (
                <span className="ml-1 text-xs bg-green-100 text-green-700 px-1 py-0.5 rounded">
                  Default
                </span>
              )}
            </Label>
          </div>
            {entity.children && entity.children.length > 0 && (
              <div className="space-y-1">
                {entity.children.map(child => renderEntity(child, level + 1))}
              </div>
            )}
        </div>
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm">{title}</h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {/* Default Display Toggle
          {onToggleDefaultDisplay && (
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="default-display-only"
                  checked={showDefaultDisplayOnly}
                  onCheckedChange={onToggleDefaultDisplay}
                />
                <Label htmlFor="default-display-only" className="text-sm cursor-pointer">
                  Show only default display items
                </Label>
              </div>
              {showDefaultDisplayOnly ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </div>
          )} */}

          {/* Action buttons */}
          <div className="flex gap-2">
            {onShowAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={onShowAll}
                className="flex-1"
              >
                <Eye className="h-3 w-3 mr-1" />
                Show All
              </Button>
            )}
            {onHideAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={onHideAll}
                className="flex-1"
              >
                <EyeOff className="h-3 w-3 mr-1" />
                Hide All
              </Button>
            )}
            {onResetToDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetToDefault}
                className="flex-1"
              >
                Reset
              </Button>
            )}
          </div>

          <Separator />

          {/* Entity list */}
          <ScrollArea className="h-80">
            <div className="space-y-4">
              {nestedEntities.map(entity => renderEntity(entity, 0))}
            </div>
          </ScrollArea>

          <Separator />

          <div className="text-xs text-muted-foreground">
            <p>Use this control to show/hide specific departments, classes, and subclasses in the table.</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

EntityVisibilityControl.displayName = 'EntityVisibilityControl'

export default EntityVisibilityControl