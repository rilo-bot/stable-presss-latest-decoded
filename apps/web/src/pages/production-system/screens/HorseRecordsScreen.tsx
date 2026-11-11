import { HorseRecordsProductionSystem } from '../../newsroom/production-systems/HorseRecordsProductionSystem';
import { usePS } from '../context';
import { useHorseRecordsActions } from '../operator-team/useRegisterOperatorActions';

export default function HorseRecordsScreen() {
  const { ps } = usePS();
  // Stablehand Operator actions for this register (search / add).
  useHorseRecordsActions(ps);
  return (
    <HorseRecordsProductionSystem
      horses={ps.horses ?? []}
      salesRecords={ps.salesRecords ?? []}
      reportRecords={ps.reportRecords ?? []}
      setEditSale={ps.setEditSale}
      setSalesFormOpen={ps.setSalesFormOpen}
      removeSale={ps.removeSale}
      setEditReport={ps.setEditReport}
      setReportFormOpen={ps.setReportFormOpen}
      removeReport={ps.removeReport}
    />
  );
}
