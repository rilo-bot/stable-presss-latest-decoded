import { useOutletContext } from 'react-router-dom';
import type { ProductionSystemState } from './useProductionSystemState';

/**
 * Typed accessor for the state the layout route shares with every screen.
 * The type is derived from the hook that builds it, so adding a field to
 * `useProductionSystemState` makes it available here with no second
 * declaration to keep in sync.
 */
export function usePS(): ProductionSystemState {
  return useOutletContext<ProductionSystemState>();
}
