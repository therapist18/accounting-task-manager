// @ts-nocheck
"use client"
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { History, Eye, Clock, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Department, HistoricalRatePeriod } from '@/types/department';

interface HistoricalRatesDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  selectedDepartment: string;
  historicalPeriods: HistoricalRatePeriod[];
  loadingHistory: boolean;
  onViewHistoricalPeriod: (period: HistoricalRatePeriod) => void;
}

export function HistoricalRatesDialog({
  isOpen,
  onOpenChange,
  departments,
  selectedDepartment,
  historicalPeriods,
  loadingHistory,
  onViewHistoricalPeriod,
}: HistoricalRatesDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <History className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Rate History</h3>
              <p className="text-sm text-muted-foreground">
                {departments.find(d => d.id === selectedDepartment)?.name}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {loadingHistory ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading historical data...</p>
            </div>
          ) : historicalPeriods.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <History className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-muted-foreground">No historical data found for this department.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historicalPeriods.map((period) => (
                <Card 
                  key={period.id} 
                  className={`
                    cursor-pointer transition-all duration-200 hover:shadow-md
                    ${period.isActive 
                      ? 'border-2 border-blue-500 bg-blue-50/50 shadow-sm' 
                      : 'border border-slate-200 hover:border-slate-300'
                    }
                  `}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${period.isActive ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                          <span className="font-semibold text-slate-800">
                            {format(period.effectiveFrom, "PPP")}
                            {period.effectiveTo && ` - ${format(period.effectiveTo, "PPP")}`}
                          </span>
                          {period.isActive && (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              Active
                            </Badge>
                          )}
                        </div>
                        
                        {period.description && (
                          <p className="text-sm text-slate-600 bg-slate-50 px-3 py-1 rounded">
                            {period.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-6 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            <span>USD Rate: {period.exchangeRates.usd}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span>Entries: {period.data.length}</span>
                          </div>
                          {period.createdAt && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>Created: {format(period.createdAt, "PP")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewHistoricalPeriod(period)}
                        className="ml-4 hover:bg-blue-50 hover:border-blue-300"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
