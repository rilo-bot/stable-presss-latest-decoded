import { HorseRecordsProductionSystem } from '../../newsroom/production-systems/HorseRecordsProductionSystem';
import { usePS } from '../context';

export default function HorseRecordsScreen() {
  const { ps } = usePS();
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
