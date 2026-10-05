const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

const cache = new Map()

/**
 * Genera una textura de tramado ordenado (dithering) al estilo de las capas de
 * privacidad retro. Se cachea porque el patron solo depende del par de colores.
 */
export function makeDitherTexture({ fg = '110 204 175', bg = '17 46 129', opacity = 0.55 } = {}) {
  const key = `${fg}|${bg}|${opacity}`
  if (cache.has(key)) return cache.get(key)

  const cell = 8
  const scale = 6
  const canvas = document.createElement('canvas')
  canvas.width = cell
  canvas.height = cell
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(cell, cell)

  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const threshold = (BAYER_8[y][x] + 0.5) / 64
      const lit = threshold < opacity
      const idx = (y * cell + x) * 4
      const rgb = lit ? fg.split(' ').map(Number) : bg.split(' ').map(Number)
      image.data[idx] = rgb[0]
      image.data[idx + 1] = rgb[1]
      image.data[idx + 2] = rgb[2]
      image.data[idx + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  const url = `url(${canvas.toDataURL()})`
  const style = {
    backgroundImage: url,
    backgroundSize: `${cell * scale}px ${cell * scale}px`,
  }
  cache.set(key, style)
  return style
}