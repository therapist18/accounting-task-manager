'use client';

import { useEffect } from 'react';

export function TestComponent() {
  useEffect(() => {
    console.log('TestComponent mounted');
    return () => console.log('TestComponent unmounted');
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-100 p-4 text-center z-50">
      <p>Test Component is working! Check the console for logs.</p>
    </div>
  );
}
