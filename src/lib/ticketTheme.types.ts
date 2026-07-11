export interface TicketTheme {
  primary: string // brand/background color
  accent: string // highlight (code, perforations)
  text: string // legible text on primary
  secondary: string
}

export const DEFAULT_TICKET_THEME: TicketTheme = {
  primary: '#14110E',
  accent: '#FF4D2E',
  text: '#FFFFFF',
  secondary: '#FFD23F',
}

export interface TicketData {
  uniqueCode: string
  eventTitle: string
  eventDate: string
  eventVenue: string
  respondentName: string
  qrSvg: string // inline SVG markup string from qrcode
  theme?: TicketTheme
}
