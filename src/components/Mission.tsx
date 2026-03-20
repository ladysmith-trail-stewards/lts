import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function Mission() {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Our Mission</CardTitle>
        <CardDescription>
          Building sustainable trails for our community
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-base text-muted-foreground leading-relaxed">
          Ladysmith Trail Stewards is a volunteer-driven organization committed
          to planning, maintaining, and advocating for sustainable, inclusive,
          and enjoyable trail experiences in and around Ladysmith, BC. We
          collaborate with the town and local community to ensure our trails
          support recreation, conservation, and economic development.
        </p>
      </CardContent>
    </Card>
  );
}

export default Mission;
