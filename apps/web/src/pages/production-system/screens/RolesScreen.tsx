import { RolesPermissionsView } from '../../newsroom/views/RolesPermissionsView';
import { usePS } from '../context';

export default function RolesScreen() {
  const s = usePS();
  return (
    <>
      <RolesPermissionsView canManageRoles={s.canManageRoles} />
    </>
  );
}
