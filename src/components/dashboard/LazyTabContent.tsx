'use client';

import { Suspense, ComponentType } from 'react';
import { KpiSkeleton } from './LoadingSkeleton';

interface LazyTabContentProps<T extends Record<string, any>> {
  component: ComponentType<T>;
  props: T;
}

export function LazyTabContent<T extends Record<string, any>>({ component: Component, props }: LazyTabContentProps<T>) {
  return (
    <Suspense fallback={<KpiSkeleton />}>
      <Component {...props} />
    </Suspense>
  );
}
