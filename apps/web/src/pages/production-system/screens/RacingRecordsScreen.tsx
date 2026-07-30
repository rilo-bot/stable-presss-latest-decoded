import { RacingProductionSystem } from '../../newsroom/production-systems/RacingProductionSystem';
import { usePS } from '../context';

export default function RacingRecordsScreen() {
  const { ps } = usePS();
  return (
    <>
      <RacingProductionSystem
        racingEntries={ps.racingEntries ?? []}
        horses={ps.horses ?? []}
        filteredRacingEntries={ps.filteredRacingEntries}
        racingSearch={ps.racingSearch}
        setRacingSearch={ps.setRacingSearch}
        racingHorseFilter={ps.racingHorseFilter}
        setRacingHorseFilter={ps.setRacingHorseFilter}
        onOpenRacingForm={ps.handleOpenRacingForm}
        onRacingDelete={ps.handleRacingDelete}
        racingDeleteConfirm={ps.racingDeleteConfirm}
        racingDeleteTarget={ps.racingDeleteTarget}
        setRacingDeleteConfirm={ps.setRacingDeleteConfirm}
        setRacingDeleteTarget={ps.setRacingDeleteTarget}
        confirmRacingDelete={ps.confirmRacingDelete}
      />
    </>
  );
}
