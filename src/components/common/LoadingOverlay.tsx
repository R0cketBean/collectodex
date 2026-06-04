import React from 'react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  transparent?: boolean;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  isLoading, 
  message = 'Daten werden verarbeitet...',
  transparent = true
}) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
         style={{ 
           backgroundColor: transparent ? 'rgba(255, 255, 255, 0.7)' : 'white',
           backdropFilter: 'blur(2px)'
         }}
    >
      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-pokemon-blue"></div>
      <p className="mt-4 text-lg font-medium text-gray-800 dark:text-gray-100 text-center max-w-[80%]">
        {message}
      </p>
    </div>
  );
};

export default LoadingOverlay; 