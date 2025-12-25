import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardBody, Button, Spinner } from '@heroui/react';
import { Check, SkipForward, ArrowRight, X } from 'lucide-react';
import { ApiService, type InspoItem } from '../services/api';

interface InspirationGalleryProps {
  onSelect: (inspoId: string) => void;
  onSelectWithItem?: (inspoId: string, item: InspoItem) => void;
  onSkip: () => void;
  onCancel?: () => void;
  isLoading: boolean;
}

const ITEMS_PER_PAGE = 12;

export default function InspirationGallery({
  onSelect,
  onSelectWithItem,
  onSkip,
  onCancel,
  isLoading,
}: InspirationGalleryProps) {
  const [items, setItems] = useState<InspoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center py-20">
        <Spinner size="lg" color="primary" />
        <p className="text-default-500 mt-4">Loading inspiration gallery...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto text-center py-20">
        <p className="text-danger mb-4">{error}</p>
        <Button variant="flat" onPress={onSkip}>
          Skip and continue
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with optional cancel button */}
      <div className="flex items-center justify-between p-4 border-b border-divider">
        <div className="flex-1" />
        <div className="text-center flex-1">
          <h2 className="text-lg font-semibold text-foreground">
            Pick a design that inspires you
          </h2>
        </div>
        <div className="flex-1 flex justify-end">
          {onCancel && (
            <Button
              variant="light"
              size="sm"
              isIconOnly
              onPress={onCancel}
              title="Cancel onboarding"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Gallery content - scrollable */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-default-500 text-center mb-6">
            Select a landing page style you like, or skip to let AI decide
          </p>

          {/* Gallery grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {items.map((item) => (
              <Card
                key={item.id}
                isPressable
                onPress={() => handleItemClick(item.id)}
                className={`
                  relative overflow-hidden transition-all duration-200
                  ${selectedId === item.id
                    ? 'ring-3 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
                    : 'hover:scale-[1.02] hover:shadow-lg'
                  }
                `}
              >
                <CardBody className="p-0 relative">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full aspect-[760/950] object-cover object-top"
                    loading="lazy"
                  />
                  {/* Selection indicator */}
                  {selectedId === item.id && (
                    <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className={`
                    absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
                    opacity-0 hover:opacity-100 transition-opacity duration-200
                    flex items-end p-3
                    ${selectedId === item.id ? 'opacity-100' : ''}
                  `}>
                    <span className="text-white text-sm font-medium truncate">
                      {item.name}
                    </span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
            {isLoadingMore && <Spinner size="sm" color="primary" />}
            {!hasMore && items.length > 0 && (
              <p className="text-default-400 text-sm">No more designs to load</p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation buttons - fixed at bottom */}
      <div className="p-4 border-t border-divider">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <Button
            variant="light"
            onPress={onSkip}
            isDisabled={isLoading}
            startContent={<SkipForward className="h-4 w-4" />}
          >
            Skip
          </Button>

          <Button
            color="primary"
            onPress={handleContinue}
            isDisabled={!selectedId || isLoading}
            isLoading={isLoading}
            endContent={!isLoading && <ArrowRight className="h-4 w-4" />}
          >
            {selectedId ? 'Continue with this design' : 'Select a design'}
          </Button>
        </div>
      </div>
    </div>
  );
}
