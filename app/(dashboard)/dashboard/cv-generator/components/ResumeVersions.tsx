"use client";

import React, { useState } from "react";
import { X, Copy, Plus, Trash2, Check, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ResumeVersionsProps {
  cvData: any;
  setCvData: (data: any) => void;
  cvVersions: { id: string; name: string; data: any; createdAt: string }[];
  setCvVersions: (versions: { id: string; name: string; data: any; createdAt: string }[]) => void;
  onClose: () => void;
}

export default function ResumeVersions({ cvData, setCvData, cvVersions, setCvVersions, onClose }: ResumeVersionsProps) {
  const [newVersionName, setNewVersionName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const saveAsVersion = () => {
    const name = newVersionName.trim() || `CV v${cvVersions.length + 1}`;
    const version = {
      id: Date.now().toString(),
      name,
      data: JSON.parse(JSON.stringify(cvData)),
      createdAt: new Date().toLocaleDateString(),
    };
    setCvVersions([...cvVersions, version]);
    setNewVersionName("");
    toast.success(`Saved as "${name}"`);
  };

  const loadVersion = (version: { id: string; name: string; data: any }) => {
    setCvData(version.data);
    toast.success(`Loaded "${version.name}"`);
    onClose();
  };

  const deleteVersion = (id: string) => {
    setCvVersions(cvVersions.filter(v => v.id !== id));
    toast.success("Version deleted");
  };

  const startEditing = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const saveEdit = (id: string) => {
    setCvVersions(cvVersions.map(v => v.id === id ? { ...v, name: editName } : v));
    setEditingId(null);
    toast.success("Version renamed");
  };

  const duplicateVersion = (version: { id: string; name: string; data: any }) => {
    const dup = {
      ...version,
      id: Date.now().toString(),
      name: `${version.name} (copy)`,
      createdAt: new Date().toLocaleDateString(),
    };
    setCvVersions([...cvVersions, dup]);
    toast.success(`Duplicated as "${dup.name}"`);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">Resume Versions</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Save new version */}
          <div className="flex gap-2">
            <Input value={newVersionName} onChange={e => setNewVersionName(e.target.value)} placeholder="Version name (optional)" className="h-8 text-xs" />
            <Button size="sm" onClick={saveAsVersion} className="h-8 text-xs shrink-0 bg-custom-blue hover:bg-[#2d5a94]"><Save className="h-3 w-3 mr-1" /> Save Current</Button>
          </div>

          {/* Versions list */}
          <div className="space-y-2">
            {cvVersions.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">No saved versions yet. Save your current CV as a version to start.</p>}
            {cvVersions.map((version) => (
              <div key={version.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between hover:border-slate-300 transition-colors">
                <div className="flex-1 min-w-0">
                  {editingId === version.id ? (
                    <div className="flex gap-2 items-center">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-xs flex-1" autoFocus />
                      <Button size="sm" variant="ghost" onClick={() => saveEdit(version.id)} className="h-7 w-7 p-0"><Check className="h-3 w-3 text-green-600" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-slate-800 truncate">{version.name}</div>
                      <div className="text-[10px] text-slate-400">{version.createdAt}</div>
                    </>
                  )}
                </div>
                <div className="flex gap-1 ml-3 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => loadVersion(version)} className="h-7 text-[10px] px-2" title="Load">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEditing(version.id, version.name)} className="h-7 w-7 p-0" title="Rename">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicateVersion(version)} className="h-7 w-7 p-0" title="Duplicate">
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteVersion(version.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700" title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
