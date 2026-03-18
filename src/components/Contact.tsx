import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Contact() {
  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col">
      <CardHeader>
        <CardTitle>Stay Connected</CardTitle>
        <CardDescription>
          Get updates on trail conditions, volunteer opportunities, and community events
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <form
          action="https://assets.mailerlite.com/jsonp/946503/forms/152081781058893003/subscribe"
          method="post"
          className="space-y-3"
        >
          <Input
            type="text"
            name="fields[name]"
            placeholder="Your name"

            required
          />
          <Input
            type="email"
            name="fields[email]"
            placeholder="your.email@example.com"

            required
          />
          <Button
            type="submit"
            className="w-full"
            variant="salish-sea"
          >
            Subscribe
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
