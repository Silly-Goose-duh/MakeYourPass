import type { ReactNode } from 'react'
import type { TicketData } from './ticketTheme.types'

// Perforated edge via repeating radial-gradient (no image asset, scales cleanly).
function perfEdge(color: string): Record<string, string | number> {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '14px',
    backgroundImage: `radial-gradient(circle at 10px 0, ${color} 0 6px, transparent 7px)`,
    backgroundSize: '20px 14px',
    backgroundRepeat: 'repeat-x',
  }
}

/**
 * Satori-renderable ticket. Pure inline styles (Satori supports a subset of
 * flexbox + CSS). `theme` lets clubs reskin later.
 */
export function TicketTemplate({ data }: { data: TicketData }): ReactNode {
  const t = data.theme ?? { primary: '#14110E', accent: '#FF4D2E', text: '#FFFFFF', secondary: '#FFD23F' }
  return (
    <div
      style={{
        width: '600px',
        height: '300px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: t.primary,
        color: t.text,
        fontFamily: 'Space Grotesk',
        position: 'relative',
        padding: '0',
      }}
    >
      <div style={perfEdge(t.primary)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', padding: '22px 0' }}>
        {/* Left: branding + details */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 26px',
            borderRight: `2px dashed ${t.accent}`,
          }}
        >
          <div>
            <div style={{ fontSize: 13, letterSpacing: 2, color: t.accent, fontWeight: 700 }}>
              MAKEYOURPASS
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>
              {data.eventTitle}
            </div>
          </div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>
            <div>{data.eventDate}</div>
            <div style={{ marginTop: 4 }}>{data.eventVenue}</div>
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {data.respondentName}
          </div>
        </div>

        {/* Right: QR + code */}
        <div
          style={{
            width: '210px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            padding: '12px',
          }}
        >
          <div
            style={{ width: '150px', height: '150px' }}
            dangerouslySetInnerHTML={{ __html: data.qrSvg }}
          />
          <div
            style={{
              marginTop: 8,
              fontSize: 16,
              fontWeight: 700,
              color: '#14110E',
              fontFamily: 'monospace',
              letterSpacing: 1,
            }}
          >
            {data.uniqueCode}
          </div>
        </div>
      </div>
      <div style={{ ...perfEdge(t.primary), bottom: 0, top: 'auto' }} />
    </div>
  )
}
