// @ts-nocheck
"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SaveDraftModalProps {
  showSaveDraftModal: boolean;
  setShowSaveDraftModal: (v: boolean) => void;
  savingDraftForPortal: boolean;
  setSavingDraftForPortal: (v: boolean) => void;
  draftNameInput: string;
  setDraftNameInput: (v: string) => void;
  isSavingDraft: boolean;
  saveDraft: (name: string, forPortal?: boolean) => Promise<string>;
}

export function SaveDraftModal({
  showSaveDraftModal,
  setShowSaveDraftModal,
  savingDraftForPortal,
  setSavingDraftForPortal,
  draftNameInput,
  setDraftNameInput,
  isSavingDraft,
  saveDraft,
}: SaveDraftModalProps) {
  if (!showSaveDraftModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-custom-blue flex items-center justify-center shrink-0">
            <Save className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Save CV Draft</h3>
            <p className="text-xs text-slate-400">{savingDraftForPortal ? 'Required before sharing the secure client link.' : 'Save your progress to continue later.'}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Draft Name</label>
          <Input
            value={draftNameInput}
            onChange={(e) => setDraftNameInput(e.target.value)}
            placeholder="e.g. John Smith CV – Draft 1"
            className="h-9 text-sm"
            autoFocus
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 h-9 text-sm"
            onClick={() => { setShowSaveDraftModal(false); setSavingDraftForPortal(false); }}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-9 text-sm bg-custom-blue hover:bg-[#2d5a94] text-white font-bold gap-1.5"
            disabled={!draftNameInput.trim() || isSavingDraft}
            onClick={async () => {
              const name = draftNameInput.trim();
              if (!name) return;
              const draftId = await saveDraft(name, savingDraftForPortal);
              setShowSaveDraftModal(false);
              if (savingDraftForPortal) {
                const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
                const link = `${origin}/dashboard/cv-generator?portal=true&draftId=${draftId}`;
                navigator.clipboard.writeText(link);
                toast.success('Draft saved! Client link copied to clipboard.');
              } else {
                toast.success(`Draft "${name}" saved!`);
              }
              setSavingDraftForPortal(false);
            }}
          >
            {isSavingDraft ? 'Saving...' : savingDraftForPortal ? 'Save & Copy Link' : 'Save Draft'}
          </Button>
        </div>
      </div>
    </div>
  );
}
