import { PipelineMapView } from '../../newsroom/views/PipelineMapView';
import { usePS } from '../context';
import { usePipelineOperatorActions } from '../operator-community/useAnalyticsOperatorActions';

export default function PipelineMapScreen() {
  const s = usePS();
  // The Stable Hand reads the same stage counts the map shows.
  usePipelineOperatorActions(s.buckets);
  return <PipelineMapView buckets={s.buckets} />;
}
