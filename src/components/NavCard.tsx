import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { type VariantProps } from 'class-variance-authority';

export interface NavCardProps extends VariantProps<typeof buttonVariants> {
  title: string;
  description: string;
  to: string;
  label: string;
}

export default function NavCard({ title, description, to, label, variant, size }: NavCardProps) {
  return (
    <Card className="border-slate-200 hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="text-xl text-slate-800">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link to={to} className={buttonVariants({ variant, size, className: 'w-full' })}>
          {label}
        </Link>
      </CardContent>
    </Card>
  );
}
