import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createApp, createError, defineEventHandler, defineLazyEventHandler, eventHandler, toNodeListener } from 'h3'
import { ViteNodeServer } from 'vite-node/server'
import { isAbsolute, normalize, resolve } from 'pathe'
// import { addDevServerHandler } from '@nuxt/kit'
import { isFileServingAllowed } from 'vite'
import type { ModuleNode, Plugin as VitePlugin } from 'vite'
import { getQuery, withTrailingSlash } from 'ufo'
import { normalizeViteManifest } from 'vue-bundle-renderer'
import escapeStringRegexp from 'escape-string-regexp'
import { distDir } from './dirs'
import type { ViteBuildContext } from './vite'
import { isCSS, toArray } from './utils'

// TODO: Remove this in favor of registerViteNodeMiddleware
// after Nitropack or h3 allows adding middleware after setup
export function viteNodePlugin (ctx: ViteBuildContext): VitePlugin {
  // Store the invalidates for the next rendering
  const invalidates = new Set<string>()

  function markInvalidate (mod: ModuleNode) {
    if (!mod.id) { return }
    if (invalidates.has(mod.id)) { return }
    invalidates.add(mod.id)
    markInvalidates(mod.importers)
  }

  function markInvalidates (mods?: ModuleNode[] | Set<ModuleNode>) {
    if (!mods) { return }
    for (const mod of mods) {
      markInvalidate(mod)
    }
  }

  return {
    name: 'nuxt:vite-node-server',
    enforce: 'post',
    configureServer (server) {
      server.middlewares.use('/__nuxt_vite_node__', toNodeListener(createViteNodeApp(ctx, invalidates)))

      // invalidate changed virtual modules when templates are regenerated
      ctx.nuxt.hook('app:templatesGenerated', (_app, changedTemplates) => {
        for (const template of changedTemplates) {
          const mods = server.moduleGraph.getModulesByFile(`virtual:nuxt:${encodeURIComponent(template.dst)}`)

          for (const mod of mods || []) {
            markInvalidate(mod)
          }
        }
      })

      server.watcher.on('all', (event, file) => {
        markInvalidates(server.moduleGraph.getModulesByFile(normalize(file)))
      })
    },
  }
}

// TODO: Use this when Nitropack or h3 allows adding middleware after setup
// export function registerViteNodeMiddleware (ctx: ViteBuildContext) {
//   addDevServerHandler({
//     route: '/__nuxt_vite_node__/',
//     handler: createViteNodeApp(ctx).handler,
//   })
// }

function getManifest (ctx: ViteBuildContext) {
  const css = new Set<string>()
  for (const key of ctx.ssrServer!.moduleGraph.urlToModuleMap.keys()) {
    if (isCSS(key)) {
      const query = getQuery(key)
      if ('raw' in query) { continue }
      const importers = ctx.ssrServer!.moduleGraph.urlToModuleMap.get(key)?.importers
      if (importers && [...importers].every(i => i.id && 'raw' in getQuery(i.id))) {
        continue
      }
      css.add(key)
    }
  }

  const manifest = normalizeViteManifest({
    '@vite/client': {
      file: '@vite/client',
      css: [...css],
      module: true,
      isEntry: true,
    },
    [ctx.entry]: {
      file: ctx.entry,
      isEntry: true,
      module: true,
      resourceType: 'script',
    },
  })

  return manifest
}

function createViteNodeApp (ctx: ViteBuildContext, invalidates: Set<string> = new Set()) {
  const app = createApp()

  app.use('/manifest', defineEventHandler(() => {
    const manifest = getManifest(ctx)
    return manifest
  }))

  app.use('/invalidates', defineEventHandler(() => {
    const ids = Array.from(invalidates)
    invalidates.clear()
    return ids
  }))

  app.use('/module', defineLazyEventHandler(() => {
    const viteServer = ctx.ssrServer!
    const node = new ViteNodeServer(viteServer, {
      deps: {
        inline: [
          /^virtual:/,
          /\.ts$/,
          // Rollup
          /\0/,
          // Common
          /^#/,
          /\?/,
        ],
        external: [
          '#shared',
          new RegExp('^' + escapeStringRegexp(withTrailingSlash(resolve(ctx.nuxt.options.rootDir, ctx.nuxt.options.dir.shared)))),
        ],
      },
      transformMode: {
        ssr: [/.*/],
        web: [],
      },
    })

    return eventHandler(async (event) => {
      const moduleId = decodeURI(event.path).substring(1)
      if (moduleId === '/') {
        throw createError({ statusCode: 400 })
      }
      if (isAbsolute(moduleId) && !isFileServingAllowed(moduleId, viteServer)) {
        throw createError({ statusCode: 403 /* Restricted */ })
      }
      const module = await node.fetchModule(moduleId).catch(async (err) => {
        const errorData = {
          code: 'VITE_ERROR',
          id: moduleId,
          stack: '',
          ...err,
        }

        if (!errorData.frame && errorData.code === 'PARSE_ERROR') {
          errorData.frame = await node.transformModule(moduleId, 'web').then(({ code }) => `${err.message || ''}\n${code}`).catch(() => undefined)
        }
        throw createError({ data: errorData })
      })
      return module
    })
  }))

  return app
}

export type ViteNodeServerOptions = {
  baseURL: string
  root: string
  entryPath: string
  base: string
}

export async function initViteNodeServer (ctx: ViteBuildContext) {
  // Serialize and pass vite-node runtime options
  const viteNodeServerOptions = {
    baseURL: `${ctx.nuxt.options.devServer.url}__nuxt_vite_node__`,
    root: ctx.nuxt.options.srcDir,
    entryPath: ctx.entry,
    base: ctx.ssrServer!.config.base || '/_nuxt/',
  } satisfies ViteNodeServerOptions
  process.env.NUXT_VITE_NODE_OPTIONS = JSON.stringify(viteNodeServerOptions)

  const serverResolvedPath = resolve(distDir, 'runtime/vite-node.mjs')
  const manifestResolvedPath = resolve(distDir, 'runtime/client.manifest.mjs')

  await writeFile(
    resolve(ctx.nuxt.options.buildDir, 'dist/server/server.mjs'),
    `export { default } from ${JSON.stringify(pathToFileURL(serverResolvedPath).href)}`,
  )
  await writeFile(
    resolve(ctx.nuxt.options.buildDir, 'dist/server/client.manifest.mjs'),
    `export { default } from ${JSON.stringify(pathToFileURL(manifestResolvedPath).href)}`,
  )
}
