import { MediaProductionSystem } from '../../newsroom/production-systems/MediaProductionSystem';
import { usePS } from '../context';
import { useMediaRegisterActions } from '../operator-team/useRegisterOperatorActions';

export default function MediaRecordsScreen() {
  const { ps } = usePS();
  // Stablehand Operator actions for this register (search / add).
  useMediaRegisterActions(ps);
  return (
    <>
      <MediaProductionSystem
        mediaItems={ps.mediaItems ?? []}
        horses={ps.horses ?? []}
        filteredMediaItems={ps.filteredMediaItems}
        mediaSearch={ps.mediaSearch}
        setMediaSearch={ps.setMediaSearch}
        mediaHorseFilter={ps.mediaHorseFilter}
        setMediaHorseFilter={ps.setMediaHorseFilter}
        mediaTypeFilter={ps.mediaTypeFilter}
        setMediaTypeFilter={ps.setMediaTypeFilter}
        onOpenMediaForm={ps.handleOpenMediaForm}
        onMediaDelete={ps.handleMediaDelete}
        mediaDeleteConfirm={ps.mediaDeleteConfirm}
        mediaDeleteTarget={ps.mediaDeleteTarget}
        setMediaDeleteConfirm={ps.setMediaDeleteConfirm}
        setMediaDeleteTarget={ps.setMediaDeleteTarget}
        confirmMediaDelete={ps.confirmMediaDelete}
      />
    </>
  );
}
