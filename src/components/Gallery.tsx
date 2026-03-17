import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

function Gallery() {
  const images = [
    {
      src: '/images/forest-1.jpg',
      alt: 'Forest scene 1',
    },
    {
      src: '/images/tools-1.jpg',
      alt: 'Trailbuilding tools',
    },
    {
      src: '/images/forest-3.jpg',
      alt: 'Forest scene 3',
    },
  ];

  return (
    <section className="bg-white">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <Carousel className="w-full" opts={{
            align: "start",
            loop: true,
          }}>

            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={index}>
                  <div className="p-1">
                    <div className="relative">
                      <img
                        src={image.src}
                        alt={image.alt}
                        className="w-full h-[500px] object-cover rounded-lg shadow-lg"
                      />
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
      </div>
    </section>
  );
}

export default Gallery;
