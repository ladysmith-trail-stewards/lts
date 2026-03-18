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
    <Carousel className="w-full rounded-lg shadow-lg py-16 px-4 bg-card" opts={{
      align: "start",
      loop: true,
    }}>
      <CarouselContent>
        {images.map((image, index) => (
          <CarouselItem key={index}>
            <div className="p-1">
              <img
                src={image.src}
                alt={image.alt}
                className="w-full max-h-[800px] object-contain rounded-lg"
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-4" />
      <CarouselNext className="right-4" />
    </Carousel>
  );
}

export default Gallery;
