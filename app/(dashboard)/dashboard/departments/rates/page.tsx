import RateCardsPage from "./rate-card/RateCardsPage"

// Settings → Rates. MPesa rates and the previous department rates table are tabs inside it. The
// rate card reads the session-cached department tree itself, so it needs no props (the Departments
// page still passes its list, which is ignored).
export default function RatesPage() {
  return <RateCardsPage />
}
