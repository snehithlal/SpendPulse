'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as repository from '@/lib/repository';
import type { Preferences, Transaction } from '@/lib/schema';

export const useFinance = (mode: repository.StorageMode) => {
  const client = useQueryClient();
  const key = ['finance', mode];
  const query = useQuery({
    queryKey: key,
    queryFn: () => repository.loadData(mode),
    staleTime: 30000,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: 'save'; value: Transaction }
        | { type: 'delete'; id: string }
        | { type: 'preferences'; value: Preferences }
        | { type: 'import'; value: Transaction[] }
        | { type: 'undo'; id: string },
    ) => {
      switch (action.type) {
        case 'save':
          return repository.saveTransaction(mode, action.value);
        case 'delete':
          return repository.deleteTransaction(mode, action.id);
        case 'preferences':
          return repository.savePreferences(mode, action.value);
        case 'import':
          return repository.saveImport(mode, action.value);
        case 'undo':
          return repository.undoImport(mode, action.id);
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return {
    ...query,
    mutate: mutation.mutateAsync,
    saving: mutation.isPending,
    mutationError: mutation.error,
  };
};
