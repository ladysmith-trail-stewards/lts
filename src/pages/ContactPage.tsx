import { Link } from 'react-router-dom';
import ContactPageComponent from '../components/ContactPage';

export default function ContactPage() {
  return (
    <div className="py-8">
      <div className="container mx-auto px-4 text-center mb-6">
        <Link 
          to="/" 
          className="text-blue-600 hover:text-blue-700 underline"
        >
          ← Back to Home
        </Link>
      </div>
      <ContactPageComponent />
    </div>
  );
}
