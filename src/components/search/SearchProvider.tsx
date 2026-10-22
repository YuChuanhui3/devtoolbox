import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { SearchDialog } from './SearchDialog';

interface SearchContextValue {
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, openSearch, closeSearch }),
    [isOpen, openSearch, closeSearch],
  );

  return (
    <SearchContext.Provider value={value}>
      {children}
      <SearchDialog open={isOpen} onClose={closeSearch} />
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch 必须在 SearchProvider 内使用');
  }
  return context;
}
