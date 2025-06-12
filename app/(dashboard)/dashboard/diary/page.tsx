"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Save } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

export default function DiaryPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [diaryContent, setDiaryContent] = useState("")

  const diaryEntries = [
    {
      id: "1",
      date: "2023-06-01",
      content: "Completed tax filing for ABC Corporation. Client was satisfied with the quick turnaround time.",
    },
    {
      id: "2",
      date: "2023-06-02",
      content: "Started working on passport application for XYZ Limited. Waiting for additional documents from client.",
    },
    {
      id: "3",
      date: "2023-06-03",
      content: "Attended training session on new KRA regulations. Updated our internal processes accordingly.",
    },
  ]

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Personal Diary</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Entry</CardTitle>
            <CardDescription>Record your daily activities and notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal mt-1",
                      !selectedDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Content</label>
              <Textarea
                placeholder="Write your diary entry here..."
                value={diaryContent}
                onChange={(e) => setDiaryContent(e.target.value)}
                className="mt-1 min-h-[200px]"
              />
            </div>
            <Button className="w-full">
              <Save className="mr-2 h-4 w-4" />
              Save Entry
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Entries</CardTitle>
            <CardDescription>Your recent diary entries.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {diaryEntries.map((entry) => (
                <div key={entry.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{format(new Date(entry.date), "PPP")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{entry.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
