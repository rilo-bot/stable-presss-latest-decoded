import { useEffect } from 'react';

import { TeamManagementView } from '../../newsroom/views/TeamManagementView';
import { usePS } from '../context';

export default function TeamScreen() {
  const s = usePS();

  // The roster is only fetched when this screen is open — it used to be an
  // `activeNav === 'team'` effect in the parent page.
  useEffect(() => {
    if (s.canManageTeam) void s.fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.canManageTeam, s.fetchTeam]);

  return (
    <>
      <TeamManagementView
        canManageTeam={s.canManageTeam}
        teamStaff={s.teamStaff}
        teamPending={s.teamPending}
        teamLoading={s.teamLoading}
        teamEmail={s.teamEmail}
        setTeamEmail={s.setTeamEmail}
        teamRole={s.teamRole}
        setTeamRole={s.setTeamRole}
        teamBusy={s.teamBusy}
        onGrantStaff={s.onGrantStaff}
        onCancelInvite={s.onCancelInvite}
      />
    </>
  );
}
