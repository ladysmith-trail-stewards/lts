import NavCard from './NavCard';
import Contact from './Contact';
import { cardRoutes } from '@/routes';

export default function NavigationCards() {
  return (
    <div className="flex flex-col gap-4">
      {cardRoutes.map((route) => (
        <NavCard
          key={route.to}
          to={route.to}
          title={route.title}
          description={route.description ?? ''}
          label={route.linkProps.label}
          variant={route.linkProps.variant}
        />
      ))}
      <Contact />
    </div>
  );
}
