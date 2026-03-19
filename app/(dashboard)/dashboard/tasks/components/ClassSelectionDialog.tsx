"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface ClassSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTaskForPush: {
    task: any
    targetDeptId: number
    targetSubDeptId: number
    targetSubDeptName: string
    isApplicant: boolean
    applicantAge: number | null
    applicantClassId?: string
    dependantClasses?: Map<string, string>
  } | null
  availableClasses: any[]
  taskDependants: Map<string, any[]>
  setSelectedTaskForPush: (task: any) => void
  executePushCase: (
    task: any,
    targetDeptId: number,
    targetSubDeptId: number,
    targetSubDeptName: string,
    applicantClassId: string | null,
    dependantClassId: string | null
  ) => Promise<void>
}

export function ClassSelectionDialog({
  open,
  onOpenChange,
  selectedTaskForPush,
  availableClasses,
  taskDependants,
  setSelectedTaskForPush,
  executePushCase
}: ClassSelectionDialogProps) {
  const handleClose = () => {
    onOpenChange(false)
    setSelectedTaskForPush(null)
  }

  const handlePushCase = async () => {
    if (selectedTaskForPush) {
      onOpenChange(false)
      const adultDependants = (taskDependants.get(selectedTaskForPush.task.id.toString()) || [])
        .filter(dep => dep.age !== null && dep.age >= 18)
      const anyAdultWithoutClass = adultDependants.some(dep =>
        !selectedTaskForPush?.dependantClasses?.has(dep.id)
      )
      const unknownAgeDependants = (taskDependants.get(selectedTaskForPush.task.id.toString()) || [])
        .filter(dep => dep.age === null)
      const isPushDisabled =
        selectedTaskForPush?.applicantAge === null ||
        !selectedTaskForPush?.applicantClassId ||
        anyAdultWithoutClass ||
        unknownAgeDependants.length > 0
      if (!isPushDisabled) {
        await executePushCase(
          selectedTaskForPush.task,
          selectedTaskForPush.targetDeptId,
          selectedTaskForPush.targetSubDeptId,
          selectedTaskForPush.targetSubDeptName,
          selectedTaskForPush.applicantClassId || null,
          null // dependantClassId removed as it doesn't exist in the interface
        )
      }
      setSelectedTaskForPush(null)
    }
  }

  const isDisabled = !selectedTaskForPush ||
    selectedTaskForPush.applicantAge === null ||
    selectedTaskForPush.applicantAge === undefined ||
    !selectedTaskForPush.applicantClassId ||
    (() => {
      const deps = taskDependants.get(selectedTaskForPush.task.id.toString()) || []
      // Check for any unknown age dependants
      if (deps.some(dep => dep.age === null || dep.age === undefined)) return true

      // Check for adult dependants without selected classes
      const adultDeps = deps.filter(dep => dep.age !== null && dep.age !== undefined && dep.age >= 18)
      if (adultDeps.length === 0) return false

      return !selectedTaskForPush.dependantClasses ||
        adultDeps.some(dep => !selectedTaskForPush.dependantClasses?.has(dep.id))
    })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Classes for Alien Case</DialogTitle>
          <DialogDescription>
            Choose the appropriate classes for {selectedTaskForPush?.task.applicant_name} and dependants under Alien subdepartment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {(selectedTaskForPush?.applicantAge === null || selectedTaskForPush?.applicantAge === undefined) ? (
            <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    Age verification required for applicant: <strong>{selectedTaskForPush?.task.applicant_name}</strong>
                    <br />
                    Please update the applicant's date of birth in the case details before selecting a class.
                    <br />
                    <span className="text-xs text-gray-600">
                      Current DOB: {selectedTaskForPush?.task.date_of_birth || 'Not specified'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-medium text-sm">
                Class for Applicant: {selectedTaskForPush?.task.applicant_name}
                <span className="text-muted-foreground font-normal"> (Age: {selectedTaskForPush?.applicantAge})</span>
              </h4>
              <div className="grid gap-2">
                {availableClasses.map((classItem) => (
                  <Button
                    key={`applicant-${classItem.id}`}
                    variant="outline"
                    className="w-full justify-start h-auto p-3 text-left"
                    onClick={() => {
                      setSelectedTaskForPush((prev: any) => prev ? { ...prev, applicantClassId: classItem.id.toString() } : null)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${selectedTaskForPush?.applicantClassId === classItem.id.toString()
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300'
                        }`}>
                        {selectedTaskForPush?.applicantClassId === classItem.id.toString() && (
                          <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold">{classItem.name}</div>
                        {classItem.description && (
                          <div className="text-sm text-muted-foreground">
                            {classItem.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Dependants Class Selection */}
          {(() => {
            const taskDeps = taskDependants.get(selectedTaskForPush?.task.id.toString() || '') || []
            // Only include dependants with known age >= 18
            const adultDependants = taskDeps.filter(dep => dep.age !== null && dep.age >= 18)
            const unknownAgeDependants = taskDeps.filter(dep => dep.age === null)

            return (
              <div className="space-y-6">
                {/* Known Adult Dependants */}
                {adultDependants.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm border-b pb-1">
                      Adult Dependants
                    </h4>
                    {adultDependants.map((dependant, index) => (
                      <div key={`adult-${dependant.id}`} className="space-y-2">
                        <div className="font-medium text-sm">
                          {dependant.full_name} (Age: {dependant.age})
                        </div>
                        <div className="grid gap-2 pl-4">
                          {availableClasses.map((classItem) => (
                            <Button
                              key={`adult-${dependant.id}-${classItem.id}`}
                              variant="outline"
                              className="w-full justify-start h-auto p-3 text-left"
                              onClick={() => {
                                setSelectedTaskForPush((prev: any) => {
                                  if (!prev) return null
                                  const updatedDependantClasses = new Map(prev.dependantClasses || new Map())
                                  updatedDependantClasses.set(dependant.id, classItem.id.toString())
                                  return { ...prev, dependantClasses: updatedDependantClasses }
                                })
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded-full border-2 ${selectedTaskForPush?.dependantClasses?.get(dependant.id) === classItem.id.toString()
                                  ? 'bg-orange-500 border-orange-500'
                                  : 'border-gray-300'
                                  }`}>
                                  {selectedTaskForPush?.dependantClasses?.get(dependant.id) === classItem.id.toString() && (
                                    <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold">{classItem.name}</div>
                                  {classItem.description && (
                                    <div className="text-sm text-muted-foreground">
                                      {classItem.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unknown Age Dependants */}
                {unknownAgeDependants.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-amber-600 border-b border-amber-200 pb-1">
                      Dependants with Unknown Age
                    </h4>
                    <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-md">
                      <p className="font-medium mb-2">Age Verification Required</p>
                      <p>Please verify the age for these dependants before proceeding:</p>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {unknownAgeDependants.map(dep => (
                          <li key={`unknown-${dep.id}`}>
                            {dep.full_name} (Age not specified)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePushCase}
            disabled={isDisabled}
          >
            Push Case
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
