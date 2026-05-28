import React from 'react';
import { useLoading } from '../../context/LoadingContext';
import LoadingOverlay from './LoadingOverlay';

const LoadingOverlayContainer: React.FC = () => {
  const { isLoading, message } = useLoading();
  
  return <LoadingOverlay isLoading={isLoading} message={message} />;
};

export default LoadingOverlayContainer; 