import { useState, useEffect } from 'react';
import { Calculator, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';

interface ExchangeRatesDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentRate: number;
  onSave: (rate: number) => void;
  isReadOnly?: boolean;
}

export function ExchangeRatesDialog({
  isOpen,
  onOpenChange,
  currentRate,
  onSave,
  isReadOnly = false,
}: ExchangeRatesDialogProps) {
  const [tempRate, setTempRate] = useState(currentRate);

  // Update temp rate when currentRate changes
  useEffect(() => {
    setTempRate(currentRate);
  }, [currentRate]);

  const handleSave = () => {
    if (tempRate <= 0) {
      toast({
        title: "Invalid Rate",
        description: "Exchange rate must be greater than 0",
        variant: "destructive",
      });
      return;
    }
    
    onSave(tempRate);
    onOpenChange(false);
    
    toast({
      title: "Exchange Rate Updated",
      description: `USD rate set to ${tempRate} KSH`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isReadOnly}>
          <Calculator className="h-4 w-4 mr-2" />
          Exchange Rates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calculator className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Configure Exchange Rates</h3>
              <p className="text-sm text-muted-foreground">Set the USD to KSH conversion rate</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="usd-rate" className="text-sm font-medium">USD to KSH Rate</Label>
            <Input
              id="usd-rate"
              type="number"
              value={tempRate || ''}
              onChange={(e) => setTempRate(parseFloat(e.target.value) || 0)}
              placeholder="Enter USD to KSH rate"
              className="text-lg font-mono text-center"
              step="0.01"
              min="0"
            />
            <p className="text-xs text-muted-foreground">
              Current rate: 1 USD = {tempRate} KSH
            </p>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-1">Important</p>
                <p className="text-blue-700">
                  This rate will be used to automatically convert USD amounts to KSH for all calculations in this period.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => {
              setTempRate(currentRate);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Calculator className="h-4 w-4 mr-2" />
            Save Rates
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
