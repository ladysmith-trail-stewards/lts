import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Contact() {
  return (
    <section id="newsletter" className="bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">
            Stay Connected
          </h2>
          <p className="text-slate-600 mb-8">
            Get updates on trail conditions, volunteer opportunities, and community events
          </p>
          
          <form 
            action="https://assets.mailerlite.com/jsonp/946503/forms/152081781058893003/subscribe"
            method="post"
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  type="text"
                  name="fields[name]"
                  placeholder="Your name"
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <Input
                  type="email"
                  name="fields[email]"
                  placeholder="your.email@example.com"
                  className="border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
            >
              Subscribe to Newsletter
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
