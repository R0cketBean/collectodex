/**
 * Service für die Kommunikation mit dem Preis-Scraping-Server
 */

// API-Basis-URL - in einer echten Produktionsanwendung sollte dies in einer .env-Datei sein
const API_BASE_URL = 'http://localhost:3001/api';

/**
 * Ruft den aktuellen Preis von Cardmarket ab
 * @param cardmarketUrl Die vollständige URL zur Cardmarket-Produktseite
 */
export const fetchPriceFromCardmarket = async (cardmarketUrl: string): Promise<PriceResult> => {
  try {
    // Sicherstellen, dass die URL gültig ist und zu Cardmarket gehört
    if (!cardmarketUrl || !cardmarketUrl.includes('cardmarket.com')) {
      throw new Error('Ungültige URL. Bitte geben Sie eine gültige Cardmarket-URL ein.');
    }

    const response = await fetch(`${API_BASE_URL}/price?url=${encodeURIComponent(cardmarketUrl)}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Ein unbekannter Fehler ist aufgetreten.');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Fehler beim Abrufen des Preises:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten'
    };
  }
};

/**
 * Interface für das Ergebnis des Preisabrufs
 */
export interface PriceResult {
  success: boolean;
  lowestPrice?: string; // Der niedrigste Verkaufspreis als numerischer String
  trendPrice?: string;  // Der Trend-Preis als numerischer String
  rawLowestPrice?: string; // Original-Text vom Scraping
  rawTrendPrice?: string;  // Original-Text vom Scraping
  error?: string;       // Fehlermeldung, falls success = false
} 