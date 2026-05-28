import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  message: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

interface LoadingProviderProps {
  children: ReactNode;
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('Daten werden verarbeitet...');

  const showLoading = (message = 'Daten werden verarbeitet...') => {
    setMessage(message);
    setIsLoading(true);
  };

  const hideLoading = () => {
    setIsLoading(false);
  };

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        message,
        showLoading,
        hideLoading
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
};

export default LoadingContext; 