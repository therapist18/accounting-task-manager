// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Save, Eye } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { saveUserVisibilitySettings } from "./utils/visibilitySettings"

interface RowVisibilityManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: any[]; // List of stages
  headers: any[]; // List of header definitions { id, label }
  
  // Current session state (Report View)
  currentVisibleStageIds: Set<string>;
  currentVisibleHeaderIds: Set<string>;
  
  // Saved DB state (Default View)
  savedDefaultStageIds: Set<string>;
  savedDefaultHeaderIds: Set<string>;
  
  userId: string;
  
  // Update functions
  onApply: (newVisibleStageIds: Set<string>, newVisibleHeaderIds: Set<string>) => void;
  onDefaultsUpdated: (newDefaultStageIds: Set<string>, newDefaultHeaderIds: Set<string>) => void;
}

export function RowVisibilityManagementDialog({
  open,
  onOpenChange,
  stages,
  headers,
  currentVisibleStageIds,
  currentVisibleHeaderIds,
  savedDefaultStageIds,
  savedDefaultHeaderIds,
  userId,
  onApply,
  onDefaultsUpdated
}: RowVisibilityManagementDialogProps) {
  // --- Local State for Stages ---
  const [localStageDefaults, setLocalStageDefaults] = useState<Set<string>>(new Set());
  const [localStageReport, setLocalStageReport] = useState<Set<string>>(new Set());

  // --- Local State for Headers ---
  const [localHeaderDefaults, setLocalHeaderDefaults] = useState<Set<string>>(new Set());
  const [localHeaderReport, setLocalHeaderReport] = useState<Set<string>>(new Set());
  
  const [activeTab, setActiveTab] = useState("headers");
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalStageDefaults(new Set(savedDefaultStageIds));
      setLocalStageReport(new Set(currentVisibleStageIds));
      
      setLocalHeaderDefaults(new Set(savedDefaultHeaderIds));
      setLocalHeaderReport(new Set(currentVisibleHeaderIds));
    }
  }, [open, savedDefaultStageIds, currentVisibleStageIds, savedDefaultHeaderIds, currentVisibleHeaderIds]);

  const toggleSelection = (id: string, set: Set<string>, setFunction: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const newSet = new Set(set);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setFunction(newSet);
  };

  const handleSaveDefaults = async () => {
    if (!userId) return;
    setIsSaving(true);
    try {
      await saveUserVisibilitySettings(userId, {
        defaultStageIds: Array.from(localStageDefaults),
        defaultHeaderIds: Array.from(localHeaderDefaults)
      });
      onDefaultsUpdated(localStageDefaults, localHeaderDefaults);
      toast({ title: "Success", description: "Default settings saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyReport = () => {
    onApply(localStageReport, localHeaderReport);
    onOpenChange(false);
    toast({ title: "View Updated", description: "Report view applied successfully." });
  };

  const sortedStages = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

  // Reusable Row Component for the table-like layout
  const VisibilityRow = ({ label, id, defaultSet, setDefault, reportSet, setReport }) => (
    <div className="grid grid-cols-3 p-3 hover:bg-slate-50 items-center text-sm border-b last:border-0">
      <div className="font-medium text-slate-700">{label}</div>
      <div className="flex justify-center">
        <Checkbox 
          checked={defaultSet.has(id)}
          onCheckedChange={() => toggleSelection(id, defaultSet, setDefault)}
          className="data-[state=checked]:bg-blue-600"
        />
      </div>
      <div className="flex justify-center">
        <Checkbox 
          checked={reportSet.has(id)}
          onCheckedChange={() => toggleSelection(id, reportSet, setReport)}
          className="data-[state=checked]:bg-green-600"
        />
      </div>
    </div>
  );

  const HeaderRow = () => (
    <div className="grid grid-cols-3 bg-slate-100 p-3 font-semibold text-sm border-b sticky top-0 z-10">
      <div>Name</div>
      <div className="text-center text-blue-700">Default Values (DB)</div>
      <div className="text-center text-green-700">Report Table (View)</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Row Visibility Manager</DialogTitle>
          <DialogDescription>
            Configure visibility for Case Details (Headers) and Stages.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start border-b rounded-none px-0 h-auto">
             <TabsTrigger value="headers" className="px-6 py-2">Case Details</TabsTrigger>
             <TabsTrigger value="stages" className="px-6 py-2">Stages</TabsTrigger>
          </TabsList>

          {/* HEADERS TAB */}
          <TabsContent value="headers" className="flex-1 overflow-hidden border rounded-b-md mt-0">
             <div className="h-full flex flex-col">
               <HeaderRow />
               <ScrollArea className="flex-1">
                 {headers.map((header) => (
                    <VisibilityRow
                      key={header.id}
                      id={header.id}
                      label={header.label}
                      defaultSet={localHeaderDefaults}
                      setDefault={setLocalHeaderDefaults}
                      reportSet={localHeaderReport}
                      setReport={setLocalHeaderReport}
                    />
                 ))}
               </ScrollArea>
             </div>
          </TabsContent>

          {/* STAGES TAB */}
          <TabsContent value="stages" className="flex-1 overflow-hidden border rounded-b-md mt-0">
             <div className="h-full flex flex-col">
               <HeaderRow />
               <ScrollArea className="flex-1">
                 {sortedStages.map((stage) => (
                    <VisibilityRow
                      key={stage.id}
                      id={stage.id.toString()}
                      label={stage.name}
                      defaultSet={localStageDefaults}
                      setDefault={setLocalStageDefaults}
                      reportSet={localStageReport}
                      setReport={setLocalStageReport}
                    />
                 ))}
               </ScrollArea>
             </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 gap-2">
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           
           <div className="flex gap-2 w-full justify-between sm:w-auto sm:justify-end">
             <Button 
               onClick={handleSaveDefaults} 
               disabled={isSaving}
               className="bg-blue-600 hover:bg-blue-700 text-white"
             >
               {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
               Save Defaults
             </Button>

             <Button 
               onClick={handleApplyReport}
               className="bg-green-600 hover:bg-green-700 text-white"
             >
               <Eye className="h-4 w-4 mr-2" />
               Apply Report View
             </Button>
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}