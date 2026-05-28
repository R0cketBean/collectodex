# Cardmarket Preis-Scraping Server

Dieser Server ermöglicht das Abrufen von aktuellen Preisen von Cardmarket-Produktseiten für die CollectODex-App.

## Installation

### Voraussetzungen
- Node.js (v14 oder höher)
- npm oder yarn

### Schritt 1: Abhängigkeiten installieren
```bash
cd server
npm install
```

### Schritt 2: Server starten
```bash
npm start
```

Der Server läuft dann unter http://localhost:3001.

## Docker-Nutzung

Alternativ können Sie den Server als Docker-Container ausführen:

### Docker-Image bauen
```bash
docker build -t cardmarket-price-scraper .
```

### Docker-Container starten
```bash
docker run -p 3001:3001 cardmarket-price-scraper
```

## API-Endpunkte

### Preis abrufen
```
GET /api/price?url=<cardmarket-url>
```

**Parameter:**
- `url`: Die vollständige URL zur Cardmarket-Produktseite

**Beispiel:**
```
GET /api/price?url=https://www.cardmarket.com/de/Pokemon/Products/Singles/...
```

**Antwort:**
```json
{
  "lowestPrice": "19.95",
  "trendPrice": "24.80",
  "rawLowestPrice": "Ab 19,95 €",
  "rawTrendPrice": "24,80 €",
  "success": true
}
```

## Hinweise

- Die Selektoren für die Preisermittlung müssen möglicherweise angepasst werden, da Cardmarket sein Layout ändern kann.
- Eine zu intensive Nutzung kann zu einer vorübergehenden Sperrung durch Cardmarket führen.
- Dieser Server sollte nur für persönliche Zwecke verwendet werden und respektiert die Nutzungsbedingungen von Cardmarket. 