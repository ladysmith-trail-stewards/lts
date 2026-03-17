function Gallery() {
  return (
    <section className="bg-white py-12">
      <div className="container mx-auto px-4 grid grid-cols-1 sm:grid-cols-1 md:grid-cols-3 gap-4">
        <img
          src="/images/forest-1.jpg"
          alt="Forest scene 1"
          className="rounded shadow"
        />
        <img
          src="/images/tools-1.jpg"
          alt="Trailbuilding tools"
          className="rounded shadow"
        />
        <img
          src="/images/forest-3.jpg"
          alt="Forest scene 3"
          className="rounded shadow"
        />
      </div>
    </section>
  );
}

export default Gallery;
