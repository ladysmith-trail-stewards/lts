function Contact() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Form will be handled by Formspree
    const form = e.target as HTMLFormElement;
    form.submit();
  };

  return (
    <>
      {/* MailerLite Section */}
      <section className="bg-green-100 py-12">
        <div className="container mx-auto max-w-xl">
          <div className="ml-embedded" data-form="yAGWse"></div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="bg-green-100 py-16 px-4 md:px-0">
        <div className="container mx-auto max-w-xl">
          <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
          <form
            action="https://formspree.io/f/mvgrpqrz"
            method="POST"
            className="space-y-4"
            onSubmit={handleSubmit}
          >
            <input
              placeholder="Your Email"
              type="email"
              name="email"
              required
              className="w-full border border-gray-300 p-2 rounded"
            />
            <textarea
              placeholder="Your Message"
              name="message"
              required
              rows={4}
              className="w-full border border-gray-300 p-2 rounded"
            />
            <button
              type="submit"
              className="bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800 transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

export default Contact;
