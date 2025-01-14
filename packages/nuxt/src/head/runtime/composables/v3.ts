import type { ActiveHeadEntry, MergeHead } from '@unhead/schema'
import type { UseHeadInput, UseHeadOptions, UseHeadSafeInput, UseSeoMetaInput } from '@unhead/vue'
import { useHead as head, useHeadSafe as headSafe, useSeoMeta as seoMeta, useServerHead as serverHead, useServerHeadSafe as serverHeadSafe, useServerSeoMeta as serverSeoMeta } from '@unhead/vue'
import { tryUseNuxtApp } from '#app'

interface NuxtUseHeadOptions extends UseHeadOptions {
  nuxt?: any
}

export function injectHead (nuxtApp?: any) {
  return (nuxtApp || tryUseNuxtApp())?.runWithContext(() => injectHead())
}

export function useHead<T extends MergeHead> (input: UseHeadInput<T>, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseHeadInput<T>> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => head<T>(input, options))
}

export function useHeadSafe<T extends MergeHead> (input: UseHeadSafeInput, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseHeadInput<T>> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => headSafe(input, options))
}

export function useSeoMeta (input: UseSeoMetaInput, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseSeoMetaInput> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => seoMeta(input, options))
}

export function useServerHead<T extends MergeHead> (input: UseHeadInput<T>, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseHeadInput<T>> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => serverHead<T>(input, options))
}

export function useServerHeadSafe (input: UseHeadSafeInput, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseSeoMetaInput> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => serverHeadSafe(input, options))
}

export function useServerSeoMeta<T extends MergeHead> (input: UseSeoMetaInput, options: NuxtUseHeadOptions = {}): ActiveHeadEntry<UseHeadInput<T>> | void {
  return (options.nuxt || tryUseNuxtApp()).runWithContext(() => serverSeoMeta(input, options))
}
