import { PipelineMapView } from '../../newsroom/views/PipelineMapView';
import { usePS } from '../context';

export default function PipelineMapScreen() {
  const s = usePS();
  return <PipelineMapView buckets={s.buckets} />;
}
