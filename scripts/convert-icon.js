const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const inputFile = path.join(__dirname, '../assets/icon.png');
const outputFile = path.join(__dirname, '../assets/icon.ico');

fs.readFile(inputFile, (err, buffer) => {
  if (err) {
    console.error('Error reading PNG file:', err);
    process.exit(1);
  }

  const ico = png2icons.createICO(buffer, png2icons.BILINEAR, 0, false, true);
  
  if (ico) {
    fs.writeFile(outputFile, ico, (err) => {
      if (err) {
        console.error('Error writing ICO file:', err);
        process.exit(1);
      }
      console.log('Successfully converted PNG to ICO');
    });
  } else {
    console.error('Error converting PNG to ICO');
    process.exit(1);
  }
}); 