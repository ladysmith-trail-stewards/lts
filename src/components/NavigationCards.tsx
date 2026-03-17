import NavCard from './NavCard';
import { cardRoutes } from '@/routes';

export default function NavigationCards() {
  return (
    <section className="bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
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
        </div>
      </div>
    </section>
  );
}
