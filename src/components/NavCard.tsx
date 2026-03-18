import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { type VariantProps } from 'class-variance-authority';

export interface NavCardProps extends VariantProps<typeof buttonVariants> {
  title: string;
  description: string;
  to: string;
  label: string;
  disabled?: boolean;
}

export default function NavCard({ title, description, to, label, variant, size, disabled }: NavCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col h-full">
      <CardHeader className="flex-1">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        {disabled ? (
          <span className={buttonVariants({ variant, size, className: 'w-full pointer-events-none opacity-40' })}>
            {label}
          </span>
        ) : (
          <Link to={to} className={buttonVariants({ variant, size, className: 'w-full' })}>
            {label}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
