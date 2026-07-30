import { HorseProductionSystem } from '../../newsroom/production-systems/HorseProductionSystem';
import { usePS } from '../context';

export default function HorsesScreen() {
  const { ps } = usePS();
  return (
    <>
      <HorseProductionSystem
        horses={ps.horses ?? []}
        filteredHorses={ps.filteredHorses}
        parties={ps.parties ?? []}
        horseSearch={ps.horseSearch}
        setHorseSearch={ps.setHorseSearch}
        expandedHorseId={ps.expandedHorseId}
        setExpandedHorseId={ps.setExpandedHorseId}
        horseConn={ps.horseConn}
        onOpenHorseForm={ps.handleOpenHorseForm}
        onHorseDelete={ps.handleHorseDelete}
        horseDeleteConfirm={ps.horseDeleteConfirm}
        horseDeleteTarget={ps.horseDeleteTarget}
        setHorseDeleteConfirm={ps.setHorseDeleteConfirm}
        setHorseDeleteTarget={ps.setHorseDeleteTarget}
        confirmHorseDelete={ps.confirmHorseDelete}
      />
    </>
  );
}
