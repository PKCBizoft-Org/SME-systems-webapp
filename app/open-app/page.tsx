'use client'

import { useEffect, useState } from 'react'

// Link target for the welcome email. Gmail will not open custom-scheme links
// (pkcbizoft://), so the email points here and this page hands over to the
// Android app. If the app is not installed, Android falls back to /download.
const PACKAGE = 'com.pkcbizoft.mobile'

export default function OpenAppPage() {
  const [isAndroid, setIsAndroid] = useState<boolean | null>(null)
  const [intentUrl, setIntentUrl] = useState('')

  useEffect(() => {
    const android = /android/i.test(navigator.userAgent)
    const fallback = encodeURIComponent(`${window.location.origin}/download`)
    const url = `intent://login#Intent;scheme=pkcbizoft;package=${PACKAGE};S.browser_fallback_url=${fallback};end`

    const timer = window.setTimeout(() => {
      setIsAndroid(android)
      setIntentUrl(url)
      if (android) window.location.replace(url)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#050d13',
        color: '#e8f1f5',
        fontFamily: 'Segoe UI, Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'transparent',
          border: '1px solid rgba(160,220,235,0.16)',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ color: '#8ea6b2', fontSize: 14, fontWeight: 500 }}>PKC BIZOFT</div>
        <h1 style={{ fontSize: 22, margin: '10px 0 8px' }}>
          {isAndroid === false ? 'Use your Android phone' : 'Opening the app…'}
        </h1>
        <p style={{ color: '#8ea6b2', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' }}>
          {isAndroid === false
            ? 'The PKC BIZOFT app is for Android phones. Open this email on your phone, or download the app below.'
            : 'If nothing happens, tap Open the app. Not installed yet? Download it first.'}
        </p>

        {isAndroid !== false && intentUrl ? (
          <a
            href={intentUrl}
            style={{
              display: 'block',
              background: '#4ce8ff',
              color: '#03141a',
              fontWeight: 800,
              textDecoration: 'none',
              padding: '12px 20px',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            Open the app
          </a>
        ) : null}

        <a
          href="/download"
          style={{
            display: 'block',
            border: '1px solid rgba(160,220,235,0.16)',
            color: '#e8f1f5',
            fontWeight: 700,
            textDecoration: 'none',
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          Download the app
        </a>
      </div>
    </main>
  )
}
