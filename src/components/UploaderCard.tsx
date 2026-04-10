/**
 * UploaderCard
 *
 * Generic card shell used on the Data Uploader page.
 * Renders a title, description, an action button that opens a dialog, and an
 * optional status line below the fold.
 */

import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Upload01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export interface UploaderCardProps {
  title: string;
  description: React.ReactNode;
  icon?: IconSvgElement;
  buttonLabel?: string;
  onOpen: () => void;
  statusLine?: React.ReactNode;
}

export default function UploaderCard({
  title,
  description,
  icon = Upload01Icon,
  buttonLabel = 'Upload',
  onOpen,
  statusLine,
}: UploaderCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" className="shrink-0" onClick={onOpen}>
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
            {buttonLabel}
          </Button>
        </div>
      </CardHeader>

      {statusLine != null && (
        <CardContent>
          <p className="text-sm text-muted-foreground">{statusLine}</p>
        </CardContent>
      )}
    </Card>
  );
}
