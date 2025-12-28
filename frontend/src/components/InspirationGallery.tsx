import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardBody, Button, Spinner, Modal, ModalContent } from '@heroui/react';
import { Check, SkipForward, ArrowRight, ZoomIn } from 'lucide-react';
import { ApiService, type InspoItem } from '../services/api';

interface InspirationGalleryProps {
  onSelect: (inspoId: string) => void;
  onSelectWithItem?: (inspoId: string, item: InspoItem) => void;
  onSkip: () => void;
  isLoading: boolean;
}

const ITEMS_PER_PAGE = 9;

export default function InspirationGallery({
  onSelect,
  onSelectWithItem,
  onSkip,
  isLoading,
}: InspirationGalleryProps) {
  const [items, setItems] = useState<InspoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<InspoItem | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Load initial items
  useEffect(() => {
    const loadInitial = async () => {
      try {
        setIsInitialLoading(true);
        const response = await ApiService.getInspoGallery(ITEMS_PER_PAGE, 0);
        setItems(response.items);
        setHasMore(response.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inspiration gallery');
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadInitial();
  }, []);

  // Load more items
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const response = await ApiService.getInspoGallery(ITEMS_PER_PAGE, items.length);
      setItems(prev => [...prev, ...response.items]);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error('Failed to load more items:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [items.length, isLoadingMore, hasMore]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, hasMore, isLoadingMore]);

  const handleItemClick = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  const handlePreviewClick = (e: React.MouseEvent, item: InspoItem) => {
    e.stopPropagation();
    setPreviewImage(item);
  };

  const handleContinue = () => {
    if (selectedId) {
      const selectedItem = items.find(item => item.id === selectedId);
      if (selectedItem && onSelectWithItem) {
        onSelectWithItem(selectedId, selectedItem);
      } else {
        onSelect(selectedId);
      }
    }
  };

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Spinner size="lg" color="primary" />
        <p className="text-default-500 mt-3 text-sm">Loading designs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-danger mb-4 text-sm">{error}</p>
        <Button variant="flat" size="sm" onPress={onSkip}>
          Skip and continue
        </Button>
      </div>
    );
  }

  return (
    <div className="relative bg-white max-h-[65vh] overflow-y-auto">
      {/* Gallery grid - 3 columns */}
      <div className="grid grid-cols-3 gap-3 p-4 pb-20">
        {items.map((item) => (
          <Card
            key={item.id}
            isPressable
            onPress={() => handleItemClick(item.id)}
            className={`
              relative overflow-hidden transition-all duration-200 bg-white shadow-none
              ${selectedId === item.id
                ? 'border-2 border-primary'
                : 'border border-default-200 hover:border-default-300'
              }
            `}
          >
            <CardBody className="p-0 relative group">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full aspect-[3/4] object-cover object-top"
                loading="lazy"
              />
              {/* Zoom button - shows on hover in top left */}
              <button
                className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md hover:bg-white cursor-pointer z-10"
                onClick={(e) => handlePreviewClick(e, item)}
              >
                <ZoomIn className="h-4 w-4 text-default-700" />
              </button>
              {/* Selection indicator */}
              {selectedId === item.id && (
                <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg z-10">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="h-8 flex items-center justify-center -mt-16 mb-8">
        {isLoadingMore && <Spinner size="sm" color="primary" />}
      </div>

      {/* Navigation buttons - glassmorphism footer */}
      <div className="sticky bottom-0 left-0 right-0 py-4 px-4 flex justify-between items-center bg-white/70 backdrop-blur-md">
        <Button
          variant="light"
          size="sm"
          onPress={onSkip}
          isDisabled={isLoading}
          startContent={<SkipForward className="h-3 w-3" />}
        >
          Skip
        </Button>

        <Button
          color="primary"
          size="sm"
          onPress={handleContinue}
          isDisabled={!selectedId || isLoading}
          isLoading={isLoading}
          endContent={!isLoading && <ArrowRight className="h-3 w-3" />}
        >
          {selectedId ? 'Use this design' : 'Select a design'}
        </Button>
      </div>

      {/* Image preview modal */}
      <Modal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        isDismissable={true}
        size="4xl"
        backdrop="blur"
        placement="center"
        hideCloseButton={true}
        classNames={{
          base: "bg-transparent shadow-none",
          wrapper: "cursor-default",
        }}
      >
        <ModalContent className="bg-transparent shadow-none w-auto max-w-none">
          {previewImage && (
            <div
              className="overflow-hidden rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage.imageUrl}
                alt={previewImage.name}
                className="max-h-[85vh] object-contain block"
              />
            </div>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
