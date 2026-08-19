import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { fetchIndividuals, type Individual } from '../../individuals/database';

interface BiodataSidebarProps {
  selectedIndividualId: string | null;
  onSelectIndividual: (individual: Individual) => void;
}

export function BiodataSidebar({ selectedIndividualId, onSelectIndividual }: BiodataSidebarProps) {
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadIndividuals() {
      setIsLoading(true);
      const data = await fetchIndividuals();
      setIndividuals(data);
      setIsLoading(false);
    }
    loadIndividuals();
  }, []);

  const filteredIndividuals = individuals.filter(ind =>
    ind.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-custom-blue" />
          Individuals
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search individuals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="p-4 text-sm text-slate-500 text-center">Loading individuals...</div>
        ) : filteredIndividuals.length === 0 ? (
          <div className="p-4 text-sm text-slate-500 text-center">No individuals found</div>
        ) : (
          <div className="space-y-1">
            {filteredIndividuals.map((ind) => {
              const isSelected = selectedIndividualId === ind.id?.toString();
              return (
                <button
                  key={ind.id}
                  onClick={() => onSelectIndividual(ind)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md text-sm transition-all duration-200",
                    "flex flex-col gap-0.5",
                    isSelected
                      ? "bg-custom-blue/10 text-custom-blue border border-custom-blue/20 shadow-sm"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent"
                  )}
                >
                  <span className="font-medium truncate">{ind.full_name}</span>
                  {ind.kra_pin && (
                    <span className="text-xs text-slate-500 truncate">
                      PIN: {ind.kra_pin}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
