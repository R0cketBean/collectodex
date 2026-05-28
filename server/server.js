const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS aktivieren, um Anfragen von der React-App zu erlauben
app.use(cors());

// Endpoint zum Abrufen von Preisen
app.get('/api/price', async (req, res) => {
  const url = req.query.url;
  
  if (!url || !url.includes('cardmarket.com')) {
    return res.status(400).json({ error: 'Ungültige URL. Nur Cardmarket-URLs werden unterstützt.' });
  }
  
  let browser = null;
  
  try {
    console.log(`Abrufen von Preisinformationen für: ${url}`);
    
    // Browser starten
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Browser-ähnliches Verhalten konfigurieren
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    
    // Seite laden mit Timeout
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    
    console.log('Seite geladen, suche nach Preisdaten...');
    
    // Warten auf Preisdaten (angepasst an verschiedene mögliche Layouts)
    await page.waitForTimeout(2000);  // Kurz warten, falls verzögert geladen wird
    
    // Preisdaten extrahieren durch Evaluieren von JavaScript im Browser-Kontext
    const priceData = await page.evaluate(() => {
      // Helper-Funktion zur Extraktion von Preistexten
      const extractText = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.innerText.trim() : null;
      };
      
      // Verschiedene Selektoren für Preisdaten versuchen
      // Preis in der Liste
      let lowestPrice = extractText('.col-price .price-container');
      
      // Preis in der Produktdetailseite
      if (!lowestPrice) {
        lowestPrice = extractText('.info-list-container .price-card');
      }
      
      // Alternative Layout-Version
      if (!lowestPrice) {
        lowestPrice = extractText('div.price-box');
      }
      
      // Neueste Version des Layouts
      if (!lowestPrice) {
        lowestPrice = extractText('.offers-table .price-container');
      }
      
      // Preistabelle
      if (!lowestPrice) {
        const priceRows = document.querySelectorAll('.table-body .price');
        if (priceRows.length > 0) {
          lowestPrice = priceRows[0].innerText.trim();
        }
      }
      
      // Trend-Preis suchen
      let trendPrice = null;
      const trendElements = document.querySelectorAll('.price-guide .price-card');
      
      for (const el of trendElements) {
        if (el.innerText.includes('Trend') || el.innerText.includes('trend')) {
          trendPrice = el.innerText.trim();
          break;
        }
      }
      
      return { lowestPrice, trendPrice };
    });
    
    console.log('Extrahierte Preisdaten:', priceData);
    
    // Screenshot für Debugging (optional)
    // await page.screenshot({ path: 'debug-screenshot.png' });
    
    // Extrahiere nur den Zahlenwert aus dem Text
    const cleanPrice = (priceText) => {
      if (!priceText) return null;
      const match = priceText.match(/(\d+[,.]\d+)/);
      return match ? match[0].replace(',', '.') : null;
    };
    
    // Preisextraktion und Rückgabe
    res.json({
      lowestPrice: cleanPrice(priceData.lowestPrice),
      trendPrice: cleanPrice(priceData.trendPrice),
      rawLowestPrice: priceData.lowestPrice,
      rawTrendPrice: priceData.trendPrice,
      success: !!(cleanPrice(priceData.lowestPrice) || cleanPrice(priceData.trendPrice))
    });
    
  } catch (error) {
    console.error('Fehler beim Scraping:', error.message);
    
    res.status(500).json({ 
      error: 'Fehler beim Abrufen des Preises', 
      message: error.message,
      success: false 
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser geschlossen');
    }
  }
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
}); 