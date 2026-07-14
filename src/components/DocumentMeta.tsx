import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || ''

type RouteMeta = {
  title: string
  description: string
  path: string
  robots?: string
}

function metaForPath(pathname: string): RouteMeta {
  if (pathname === '/' || pathname === '') {
    return {
      title: 'GRIND — Show up. Write it down. Repeat.',
      description:
        'Personal training journal for sessions, progressive overload, and recovery. Private by default.',
      path: '/',
      robots: 'index, follow',
    }
  }
  if (pathname.startsWith('/app')) {
    return {
      title: 'GRIND — App',
      description: 'Sign in to your GRIND training journal.',
      path: pathname.startsWith('/app') ? '/app' : pathname,
      robots: 'noindex, nofollow',
    }
  }
  return {
    title: 'GRIND',
    description: 'Personal training journal.',
    path: pathname,
    robots: 'noindex, follow',
  }
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

/**
 * Route-aware document title + social meta.
 * Set VITE_SITE_URL (e.g. https://grind.example.com) for absolute OG/canonical URLs.
 */
export function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const m = metaForPath(pathname)
    document.title = m.title

    setMeta('name', 'description', m.description)
    setMeta('name', 'robots', m.robots || 'index, follow')

    const origin = SITE || (typeof window !== 'undefined' ? window.location.origin : '')
    const url = origin ? `${origin}${m.path === '/' ? '/' : m.path}` : m.path

    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', 'GRIND')
    setMeta('property', 'og:title', m.title)
    setMeta('property', 'og:description', m.description)
    setMeta('property', 'og:url', url)
    if (origin) {
      setMeta('property', 'og:image', `${origin}/og.svg`)
      setCanonical(url)
    }

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', m.title)
    setMeta('name', 'twitter:description', m.description)
    if (origin) setMeta('name', 'twitter:image', `${origin}/og.svg`)
  }, [pathname])

  return null
}
