import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ContactPage() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Form will be handled by Formspree
    const form = e.target as HTMLFormElement
    form.submit()
  }

  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4">
        <Card className="max-w-2xl mx-auto border-slate-200">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-slate-800">
              Get In Touch
            </CardTitle>
            <CardDescription className="text-slate-600">
              Have questions, ideas, or want to get involved? We'd love to hear from you!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700 mb-1">
                    Name *
                  </label>
                  <Input
                    type="text"
                    id="contact-name"
                    name="name"
                    placeholder="Your full name"
                    className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email *
                  </label>
                  <Input
                    type="email"
                    id="contact-email"
                    name="email"
                    placeholder="your.email@example.com"
                    className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-700 mb-1">
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
                <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700 mb-1">
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

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                Send Message
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="text-center space-y-2">
                <p className="text-slate-600">
                  <strong>Email:</strong> info@ladysmithtrailstewards.org
                </p>
                <p className="text-slate-600">
                  <strong>Facebook:</strong>{" "}
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
