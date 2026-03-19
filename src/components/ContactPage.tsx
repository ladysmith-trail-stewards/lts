import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT as
  | string
  | undefined;

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!FORMSPREE_ENDPOINT) return;
    const form = e.target as HTMLFormElement;
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        form.reset();
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Get In Touch</CardTitle>
            <CardDescription>
              We welcome new members! To get involved and find out about events,
              send us a message below or join the{' '}
              <a
                className="text-blue-600 hover:text-blue-800 underline font-medium transition-colors"
                href="https://www.facebook.com/groups/762166175047717"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ladysmith Trail Stewards Facebook Group
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="contact-name"
                    className="block text-sm font-medium text-muted-foreground mb-1"
                  >
                    Name *
                  </label>
                  <Input
                    type="text"
                    id="contact-name"
                    name="name"
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="contact-email"
                    className="block text-sm font-medium text-muted-foreground mb-1"
                  >
                    Email *
                  </label>
                  <Input
                    type="email"
                    id="contact-email"
                    name="email"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="contact-subject"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Subject
                </label>
                <Input
                  type="text"
                  id="contact-subject"
                  name="subject"
                  placeholder="What's this about?"
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="contact-message"
                  className="block text-sm font-medium text-muted-foreground mb-1"
                >
                  Message *
                </label>
                <Textarea
                  id="contact-message"
                  name="message"
                  rows={5}
                  placeholder="Tell us about your ideas, questions, or how you'd like to get involved..."
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <Button type="submit" variant="salish-sea" className="w-full">
                Send Message
              </Button>

              {status === 'success' && (
                <p className="text-sm text-green-600 text-center">
                  Message sent successfully! We'll be in touch soon.
                </p>
              )}
              {status === 'error' && (
                <p className="text-sm text-red-600 text-center">
                  Something went wrong. Please try again or contact us directly.
                </p>
              )}
            </form>

            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">
                  <strong>Email:</strong> info@ladysmithtrailstewards.org
                </p>
                <p className="text-muted-foreground">
                  <strong>Facebook:</strong>{' '}
                  <a
                    href="https://www.facebook.com/groups/762166175047717"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Ladysmith Trail Stewards Group
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
