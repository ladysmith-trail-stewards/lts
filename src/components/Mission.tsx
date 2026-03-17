function Mission() {
  return (
    <section className="py-16 px-4 md:px-0">
      <div className="container mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
        <p className="text-lg text-gray-700 mb-8">
          Ladysmith Trail Stewards is a volunteer-driven organization committed
          to planning, maintaining, and advocating for sustainable, inclusive,
          and enjoyable trail experiences in and around Ladysmith, BC. We
          collaborate with the town and local community to ensure our trails
          support recreation, conservation, and economic development.
        </p>
        <p className="text-lg text-gray-700">
          We welcome new members! To get involved and find out about events,
          please use the contact form below, or join the{' '}
          <a
            className="text-green-600 underline"
            href="https://www.facebook.com/groups/762166175047717"
            target="_blank"
            rel="noopener noreferrer"
          >
            Ladysmith Trail Stewards Facebook Group
          </a>
          .
        </p>
      </div>
    </section>
  );
}

export default Mission;
