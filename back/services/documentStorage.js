'use strict'

/**
 * Almacenamiento de la prueba documental subida por los abogados.
 *
 * El archivo llega en base64 dentro del JSON y se guarda en disco
 * (DOCUMENTS_DIR, por defecto back/storage/documents) con un nombre aleatorio:
 * el nombre que eligio el usuario solo se guarda como etiqueta, nunca se usa
 * como ruta (evita path traversal). El tipo se valida por su firma binaria
 * ("magic bytes"), no solo por la extension: un .exe renombrado a .pdf se rechaza.
 */

const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const { unprocessable } = require('../utils/errors')

const STORAGE_DIR = path.resolve(process.env.DOCUMENTS_DIR || path.join(__dirname, '..', 'storage', 'documents'))
const MAX_BYTES = Number(process.env.DOCUMENT_MAX_MB || 5) * 1024 * 1024

/** Tipos admitidos: extension -> MIME y firma binaria esperada. */
const ALLOWED = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [0x50, 0x4b, 0x03, 0x04], // contenedor ZIP
  },
  txt: { mime: 'text/plain; charset=utf-8', magic: null },
}

const ALLOWED_EXTENSIONS = Object.keys(ALLOWED)

/** Nombre visible seguro: sin rutas, sin caracteres de control y acotado. */
function cleanFilename(name) {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'))
  // eslint-disable-next-line no-control-regex
  const safe = base.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').trim()
  return safe.slice(-200) || 'documento'
}

/** Decodifica, valida tipo y tamano. Devuelve { buffer, ext, mime, filename }. */
function validateUpload({ filename, data }) {
  const name = cleanFilename(filename)
  const ext = path.extname(name).slice(1).toLowerCase()
  const type = ALLOWED[ext]
  if (!type) {
    throw unprocessable(`Tipo de archivo no permitido. Formatos aceptados: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  const base64 = String(data ?? '').replace(/^data:[^;]*;base64,/, '')
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw unprocessable('El archivo llego vacio o dañado')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) throw unprocessable('El archivo esta vacio')
  if (buffer.length > MAX_BYTES) {
    throw unprocessable(`El archivo supera el maximo de ${MAX_BYTES / 1024 / 1024} MB`)
  }

  if (type.magic && !type.magic.every((byte, i) => buffer[i] === byte)) {
    throw unprocessable(`El contenido no corresponde a un archivo .${ext} valido`)
  }
  if (!type.magic && buffer.includes(0)) {
    throw unprocessable('El archivo .txt contiene datos binarios')
  }

  return { buffer, ext, mime: type.mime, filename: name }
}

/** Estimacion de paginas de un PDF (cuenta los objetos /Type /Page). */
function countPages(buffer, ext) {
  if (ext !== 'pdf') return 1
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)
  return Math.max(1, matches?.length ?? 1)
}

/** Guarda el archivo y devuelve la ruta relativa que se persiste en MySQL. */
async function saveFile(buffer, ext) {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
  const storedName = `${crypto.randomUUID()}.${ext}`
  await fs.writeFile(path.join(STORAGE_DIR, storedName), buffer, { flag: 'wx' })
  return storedName
}

/** Ruta absoluta de un archivo guardado; rechaza cualquier valor que salga del directorio. */
function resolveStoredFile(storedName) {
  const full = path.resolve(STORAGE_DIR, String(storedName ?? ''))
  if (path.dirname(full) !== STORAGE_DIR) throw unprocessable('Ruta de documento invalida')
  return full
}

async function removeFile(storedName) {
  try {
    await fs.unlink(resolveStoredFile(storedName))
  } catch {
    /* el archivo ya no existia */
  }
}

module.exports = {
  validateUpload,
  countPages,
  saveFile,
  resolveStoredFile,
  removeFile,
  ALLOWED_EXTENSIONS,
  MAX_BYTES,
}
