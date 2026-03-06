"use client";

import { useEffect, useCallback, useState, type ReactNode } from "react";
import { useUIStore } from "@/stores/uiStore";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface PresentationSlide {
  title: string;
  content: ReactNode;
}

interface PresentationModeProps {
  slides: PresentationSlide[];
}

export function PresentationMode({ slides }: PresentationModeProps) {
  const presentationMode = useUIStore((s) => s.presentationMode);
  const setPresentationMode = useUIStore((s) => s.setPresentationMode);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Fullscreen on mount
  useEffect(() => {
    if (presentationMode) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [presentationMode]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPresentationMode(false);
      } else if (e.key === "ArrowRight" || e.key === " ") {
        setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlide((prev) => Math.max(prev - 1, 0));
      }
    },
    [slides.length, setPresentationMode]
  );

  useEffect(() => {
    if (presentationMode) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [presentationMode, handleKeyDown]);

  // Reset slide index when entering presentation mode
  useEffect(() => {
    if (presentationMode) setCurrentSlide(0);
  }, [presentationMode]);

  if (!presentationMode || slides.length === 0) return null;

  const slide = slides[currentSlide];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b">
        <h2 className="text-xl font-bold">{slide.title}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPresentationMode(false)}
          aria-label="발표 모드 종료"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Left navigation */}
        <button
          onClick={() => setCurrentSlide((p) => Math.max(p - 1, 0))}
          disabled={currentSlide === 0}
          className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-muted/80 hover:bg-muted transition-colors",
            currentSlide === 0 && "opacity-30 cursor-not-allowed"
          )}
          aria-label="이전 슬라이드"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Right navigation */}
        <button
          onClick={() =>
            setCurrentSlide((p) => Math.min(p + 1, slides.length - 1))
          }
          disabled={currentSlide === slides.length - 1}
          className={cn(
            "absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-muted/80 hover:bg-muted transition-colors",
            currentSlide === slides.length - 1 &&
              "opacity-30 cursor-not-allowed"
          )}
          aria-label="다음 슬라이드"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Slide content with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full overflow-y-auto px-12 py-8"
          >
            {slide.content}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center py-3 border-t text-sm text-muted-foreground">
        <span className="tabular-nums">
          {currentSlide + 1} / {slides.length}
        </span>
      </div>
    </div>
  );
}
