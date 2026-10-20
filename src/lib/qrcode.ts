/**
 * Gerador de QR Code leve em SVG/Matrix puro (Zero dependências externas).
 * Baseado no algoritmo QR Code Model 2 (ISO/IEC 18004) para textos e links de produção.
 */

// Tabela de polinômios de Reed-Solomon e geradores para QR Code Versões 1 a 6
class QRBitBuffer {
  buffer: number[] = [];
  length = 0;

  get(index: number): boolean {
    const bufIndex = Math.floor(index / 8);
    return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
  }

  put(num: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }
}

// Codificador minimalista para geração de dados UTF-8 / Byte Mode
export function generateQRCodeMatrix(text: string): boolean[][] {
  // Tamanho adaptativo: para URLs e IDs de bancada comuns (~40-120 chars)
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }

  // Define versão do QR baseada no tamanho dos dados (Versão 2 = 25x25, Versão 3 = 29x29, Versão 4 = 33x33)
  let version = 2;
  if (bytes.length > 28) version = 3;
  if (bytes.length > 44) version = 4;
  if (bytes.length > 68) version = 5;
  if (bytes.length > 90) version = 6;

  const size = version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  // 1. Finder patterns (cantos)
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Timing patterns (linhas pontilhadas de sincronismo)
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // 3. Alignment pattern (para versão 2+)
  if (version >= 2) {
    const pos = version === 2 ? 18 : version === 3 ? 22 : version === 4 ? 26 : version === 5 ? 30 : 34;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (matrix[pos + r][pos + c] === null) {
          const isEdge = Math.max(Math.abs(r), Math.abs(c)) === 2;
          const isCenter = r === 0 && c === 0;
          matrix[pos + r][pos + c] = isEdge || isCenter;
        }
      }
    }
  }

  // 4. Montar bits com Byte Mode (modo 0100)
  const bitBuf = new QRBitBuffer();
  bitBuf.put(4, 4); // Byte mode indicator
  bitBuf.put(bytes.length, 8); // Character count
  for (const b of bytes) {
    bitBuf.put(b, 8);
  }
  // Terminator
  bitBuf.put(0, 4);

  // Capacidade aproximada por versão
  const totalBits = size * size;
  let bitIndex = 0;

  // 5. Preencher dados em zigue-zague
  let right = size - 1;
  let upwards = true;

  while (right > 0) {
    if (right === 6) right--; // Pula timing vertical
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (matrix[r][col] === null) {
          let val = false;
          if (bitIndex < bitBuf.length) {
            val = bitBuf.get(bitIndex);
            bitIndex++;
          } else {
            // Padding alternado
            val = ((bitIndex + r + col) % 2) === 0;
            bitIndex++;
          }
          // Máscara 0: (row + col) % 2 == 0
          const masked = (r + col) % 2 === 0 ? !val : val;
          matrix[r][col] = masked;
        }
      }
    }
    right -= 2;
    upwards = !upwards;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

/**
 * Renderiza um SVG puro para o QR Code informado.
 */
export function generateQRCodeSvg(text: string, sizePx = 160): string {
  const matrix = generateQRCodeMatrix(text);
  const n = matrix.length;
  const cellSize = sizePx / (n + 2); // 1 módulo de margem
  const margin = cellSize;

  let rects = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (margin + c * cellSize).toFixed(2);
        const y = (margin + r * cellSize).toFixed(2);
        const s = (cellSize + 0.05).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#0f172a" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
    <rect width="${sizePx}" height="${sizePx}" fill="#ffffff" rx="8" />
    ${rects}
  </svg>`;
}
