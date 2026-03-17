import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function Mission() {
  return (
    <section className="px-4 md:px-0 bg-gray-50">
      <div className="container mx-auto max-w-6xl">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-slate-800">
              Our Mission
            </CardTitle>
            <CardDescription className="text-lg text-slate-600">
              Building sustainable trails for our community
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-lg text-slate-700 leading-relaxed">
              Ladysmith Trail Stewards is a volunteer-driven organization committed to planning, maintaining, and advocating for sustainable, inclusive, and enjoyable trail experiences in and around Ladysmith, BC. We collaborate with the town and local community to ensure our trails support recreation, conservation, and economic development.
            </p>
            
            <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-500">
              <h3 className="text-xl font-semibold text-slate-800 mb-3">
                Get Involved
              </h3>
              <p className="text-slate-700">
                We welcome new members! To get involved and find out about events, please use the contact form below, or join the{' '}
                <a 
                  className="text-blue-600 hover:text-blue-800 underline font-medium transition-colors" 
                  href="https://www.facebook.com/groups/762166175047717"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ladysmith Trail Stewards Facebook Group
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default Mission;
