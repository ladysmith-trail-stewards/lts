import GeoUploaderDialog from '@/components/GeoUploaderDialog';
import { trailUploaderConfig } from '@/lib/uploaderConfigs/trailUploaderConfig';

interface TrailUploaderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (count: number) => void;
}

export default function TrailUploaderDialog(props: TrailUploaderDialogProps) {
  return <GeoUploaderDialog {...props} config={trailUploaderConfig} />;
}
