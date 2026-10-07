const sharp = require("sharp");
const path = require("path");

// Icono en SVG: un monedero/cartera sobre fondo verde
const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#059669"/>
      <stop offset="100%" style="stop-color:#047857"/>
    </linearGradient>
  </defs>
  <!-- Fondo redondeado -->
  <rect width="512" height="512" rx="96" fill="url(#grad)"/>
  <!-- Monedero -->
  <g transform="translate(256, 256)">
    <!-- Cuerpo del monedero -->
    <rect x="-140" y="-100" width="280" height="200" rx="32" fill="white" opacity="0.95"/>
    <!-- Solapa superior -->
    <path d="M-140,-40 L-60,-100 L140,-100 L140,-40 Z" fill="white" opacity="0.95"/>
    <path d="M-140,-40 L-60,-100 L60,-100 L140,-40 Z" fill="#e2e8f0" opacity="0.5"/>
    <!-- Franja decorativa -->
    <rect x="-80" y="-60" width="160" height="8" rx="4" fill="#059669" opacity="0.15"/>
    <!-- Círculo moneda central -->
    <circle cx="30" cy="15" r="35" fill="#059669" opacity="0.12"/>
    <circle cx="30" cy="15" r="35" fill="none" stroke="#059669" stroke-width="3" opacity="0.2"/>
    <circle cx="30" cy="15" r="18" fill="#059669" opacity="0.2"/>
    <!-- Líneas de detalle -->
    <line x1="-80" y1="65" x2="80" y2="65" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
    <line x1="-80" y1="90" x2="50" y2="90" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
    <!-- Cierre del monedero -->
    <circle cx="-70" cy="-70" r="8" fill="#059669" opacity="0.3"/>
  </g>
</svg>`;

async function generate() {
  const sizes = [192, 512];

  for (const size of sizes) {
    const outputPath = path.join(__dirname, "..", "public", `icon-${size}.png`);
    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ Generado: public/icon-${size}.png (${size}x${size})`);
  }

  console.log("\n🎉 Iconos PWA generados correctamente.");
}

generate().catch((err) => {
  console.error("Error generando iconos:", err);
  process.exit(1);
});
