import { PartiesProductionSystem } from '../../newsroom/production-systems/PartiesProductionSystem';
import { usePS } from '../context';

export default function PeopleScreen() {
  const { ps } = usePS();
  return (
    <>
      <PartiesProductionSystem
        safeParties={ps.safeParties}
        filteredParties={ps.filteredParties}
        partySearch={ps.partySearch}
        setPartySearch={ps.setPartySearch}
        onOpenPartyForm={ps.handleOpenPartyForm}
        onPartyDelete={ps.handlePartyDelete}
        partyDeleteConfirm={ps.partyDeleteConfirm}
        partyDeleteTarget={ps.partyDeleteTarget}
        setPartyDeleteConfirm={ps.setPartyDeleteConfirm}
        setPartyDeleteTarget={ps.setPartyDeleteTarget}
        confirmPartyDelete={ps.confirmPartyDelete}
      />
    </>
  );
}
