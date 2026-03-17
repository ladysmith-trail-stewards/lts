export default function OldGallery() {
  const images = [
    { src: '/images/forest-1.jpg', alt: 'Forest scene 1' },
    { src: '/images/tools-1.jpg', alt: 'Trailbuilding tools' },
    { src: '/images/forest-2.jpg', alt: 'Forest scene 2' },
    { src: '/images/forest-3.jpg', alt: 'Forest scene 3' },
  ];

  return (
    <section className="bg-white py-12">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-900">
          Trail Gallery
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {images.map((image, index) => (
            <div key={index} className="overflow-hidden rounded-lg shadow-lg">
              <img
                src={image.src}
                alt={image.alt}
                className="w-full h-64 object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
