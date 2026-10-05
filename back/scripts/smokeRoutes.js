'use strict'

/**
 * Verificacion de arranque sin base de datos: importa la app, comprueba que
 * los secretos estan configurados y lista las rutas registradas.
 * Uso: node scripts/smokeRoutes.js
 */

require('dotenv').config()

const app = require('../server')
const { assertSecretsConfigured } = require('../services/authService')

assertSecretsConfigured()

const API = process.env.API_PREFIX || '/api'

function walk(stack, prefix = '') {
  return stack.flatMap((layer) => {
    if (layer.route) {
      return [
        {
          path: `${prefix}${layer.route.path}`,
          methods: Object.keys(layer.route.methods).join(',').toUpperCase(),
        },
      ]
    }
    if (layer.name === 'router' && layer.handle.stack) {
      const segment = layer.regexp.source
        .replace('^\\/', '')
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
      return walk(layer.handle.stack, `${prefix}/${segment}`)
    }
    return []
  })
}

const routes = walk(app._router.stack).filter((r) => r.path !== '/' || r.methods === 'GET')

console.log(`\nAPI_PREFIX = ${API}`)
console.log('Rutas registradas:')
for (const route of routes) {
  console.log(`  ${route.methods.padEnd(12)} ${route.path}`)
}
console.log(`\nTotal: ${routes.length} rutas\n`)