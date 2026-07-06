// @ts-nocheck
"use client"

import React, { useState, useCallback, useMemo } from "react"
import { MessageSquare, Plus, Loader2, Trash2, Calendar, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"

interface NotesTabProps {
  task: any
  onRefresh?: () => void
}

export function NotesTab({ task, onRefresh }: NotesTabProps) {
  const [noteText, setNoteText] = useState("")
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const notes = useMemo(() => {
    return task?.registry_metadata?.notes || []
  }, [task])

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteText.trim()) return

    setSaving(true)
    const toastId = toast.loading("Adding note...")

    try {
      const currentNotes = task?.registry_metadata?.notes || []
      const newNote = {
        id: Math.random().toString(36).substr(2, 9),
        text: noteText,
        author: "Officer", // Default user role
        created_at: new Date().toISOString()
      }

      const updatedMetadata = {
        ...(task?.registry_metadata || {}),
        notes: [...currentNotes, newNote]
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          registry_metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast.success("Note added successfully", { id: toastId })
      setNoteText("")
      onRefresh?.()
    } catch (error) {
      console.error("Error adding note:", error)
      toast.error("Failed to add note", { id: toastId })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    setDeletingId(noteId)
    const toastId = toast.loading("Deleting note...")

    try {
      const currentNotes = task?.registry_metadata?.notes || []
      const updatedNotes = currentNotes.filter((n: any) => n.id !== noteId)

      const updatedMetadata = {
        ...(task?.registry_metadata || {}),
        notes: updatedNotes
      }

      const { error } = await supabase
        .from('tm_tasks')
        .update({
          registry_metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id)

      if (error) throw error

      toast.success("Note deleted successfully", { id: toastId })
      onRefresh?.()
    } catch (error) {
      console.error("Error deleting note:", error)
      toast.error("Failed to delete note", { id: toastId })
    } finally {
      setDeletingId(null)
    }
  }

  // Sort notes descending (newest first)
  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Internal Job Notes</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Add comments or logs regarding task completion and status changes.</p>
      </div>

      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 px-5 pt-4">
          <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600" /> Write New Note
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <form onSubmit={handleAddNote} className="space-y-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              rows={3}
              className="w-full text-sm p-3 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || !noteText.trim()}
                className="h-8 text-xs font-semibold px-4 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-sm"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add Note
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {sortedNotes.length === 0 ? (
          <div className="text-center p-8 bg-white border border-dashed rounded-lg border-slate-200">
            <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">No notes yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Be the first to leave a note on this job.</p>
          </div>
        ) : (
          sortedNotes.map((note: any) => (
            <Card key={note.id} className="border-slate-200 shadow-sm bg-white hover:border-slate-350 transition-all">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-slate-655" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800">{note.author}</span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {new Date(note.created_at).toLocaleString("en-GB", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={deletingId === note.id}
                  >
                    {deletingId === note.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="mt-3 text-sm text-slate-700 whitespace-pre-line leading-relaxed pl-1">
                  {note.text}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
