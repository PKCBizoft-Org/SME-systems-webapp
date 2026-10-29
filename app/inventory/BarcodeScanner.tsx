import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './inventory.module.css'

// Camera barcode scanner with a typed fallback. A USB/Bluetooth scanner acts
// like a keyboard, so it works through the manual box too (it types + Enter).
export function BarcodeScanner({
  title = 'Scan barcode',
  onDetected,
  onClose,
}: {
  title?: string
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(onDetected)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    let done = false
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled || !videoRef.current) return
        const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, _error, ctrl) => {
            if (!result || done) return
            done = true
            ctrl.stop()
            detectedRef.current(result.getText().trim())
          },
        )
        stop = () => controls.stop()
        if (cancelled) stop()
      } catch (err) {
        if (!cancelled) {
          const name = (err as { name?: string })?.name
          setCameraError(
            name === 'NotAllowedError'
              ? 'Camera permission was blocked. Allow it in the browser, or type the code below.'
              : 'No camera available. Type the code below, or use a USB scanner.',
          )
        }
      }
    })()
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  // Escape closes only the scanner, not the form behind it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div
      className={styles.backdrop}
      style={{ zIndex: 1000 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 440 }}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            <p className={styles.modalSub}>Point the camera at the barcode, or type it.</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {cameraError ? (
          <div className={styles.formError} role="alert">{cameraError}</div>
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10, background: '#000' }}
          />
        )}

        <form
          className={styles.form}
          style={{ marginTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault()
            if (manual.trim()) onDetected(manual.trim())
          }}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="scan-manual">Barcode / SKU</label>
            <input
              id="scan-manual"
              className={styles.input}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Type or use a USB scanner"
              autoFocus
              autoComplete="off"
            />
          </div>
          <div className={styles.formFooter}>
            <button type="button" className={styles.btn} onClick={onClose}>Cancel</button>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!manual.trim()}>
              Use code
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

type CodeItem = { barcode?: string | null; sku: string | null }

// Match a scanned code to an item by barcode first, then by SKU.
export function findByCode<T extends CodeItem>(items: T[], code: string): T | undefined {
  const term = code.trim().toLowerCase()
  if (!term) return undefined
  return (
    items.find((item) => (item.barcode || '').toLowerCase() === term) ||
    items.find((item) => (item.sku || '').toLowerCase() === term)
  )
}
