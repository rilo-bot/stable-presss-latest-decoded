import { useEffect } from 'react';

import { TeamManagementView } from '../../newsroom/views/TeamManagementView';
import { usePS } from '../context';

export default function TeamScreen() {
  const s = usePS();

  // The roster is only fetched when this screen is open — it used to be an
  // `activeNav === 'team'` effect in the parent page.
  //
  // Keyed on canVIEWteam, not canMANAGEteam: the screen is now readable with
  // `team.view` alone, and gating the fetch on `manage` would have left a
  // read-only viewer looking at a permanently empty roster.
  useEffect(() => {
    if (s.canViewTeam) void s.fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.canViewTeam, s.fetchTeam]);

  return (
    <>
      <TeamManagementView
        canViewTeam={s.canViewTeam}
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
