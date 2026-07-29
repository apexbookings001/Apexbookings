import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookingPageData } from '../features/events/bookingTemplate'
import { useLocale } from '../i18n/LocaleContext'

type Props = { hero: BookingPageData['hero']; packages: BookingPageData['packages']; accent: string; formatPrice: (value: number) => string; onPrimary: () => void; onSecondary: () => void; editorMode?: boolean }
const wrap = (value: number, length: number) => (value + length) % length

export function EventHero({ hero, packages, accent, formatPrice, onPrimary, onSecondary, editorMode }: Props) {
  const { t } = useLocale()
  const slides = hero.images.filter(Boolean).length ? hero.images.filter(Boolean) : ['']
  const [active, setActive] = useState(0)
  const [sequence, setSequence] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef<number | null>(null)
  const activeIndex = Math.min(active, slides.length - 1)
  const select = useCallback((index: number) => { setActive(wrap(index, slides.length)); setSequence(value => value + 1) }, [slides.length])
  useEffect(() => setActive(index => Math.min(index, slides.length - 1)), [slides.length])
  useEffect(() => {
    if (slides.length < 2 || paused || editorMode) return
    const timer = window.setInterval(() => select(activeIndex + 1), 7000)
    return () => window.clearInterval(timer)
  }, [activeIndex, editorMode, paused, select, slides.length])
  useEffect(() => {
    const visibility = () => setPaused(document.hidden)
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'ArrowRight') select(activeIndex + 1); if (event.key === 'ArrowLeft') select(activeIndex - 1) }
    document.addEventListener('visibilitychange', visibility); window.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', keyboard) }
  }, [activeIndex, select])
  const label = (index: number) => packages[index]?.name || (index === 0 ? t('hero.featuredMoment') : index === 1 ? hero.venue : t('hero.highlight', { number: index + 1 }))
  const startingPrice = packages.length ? Math.min(...packages.map(item => item.price)) : null
  const seats = packages.reduce((total, item) => total + Math.max(0, item.seats), 0)
  const titleLength = hero.title.trim().length
  const titleSize = titleLength > 52 ? 'is-long' : titleLength > 24 ? 'is-medium' : 'is-short'
  return <section id="hero" className="event-hero" style={{ '--hero-accent': accent } as React.CSSProperties}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
    onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; setPaused(true) }}
    onTouchEnd={event => { const start = touchStart.current, end = event.changedTouches[0]?.clientX; if (start !== null && end !== undefined && Math.abs(end - start) > 45) select(activeIndex + (end < start ? 1 : -1)); touchStart.current = null; window.setTimeout(() => setPaused(false), 1200) }}>
    <div key={`bg-${activeIndex}-${sequence}`} className="event-hero__background">{slides[activeIndex] && <img src={slides[activeIndex]} alt={`${hero.title} — ${label(activeIndex)}`} width="1600" height="1000" fetchPriority="high" />}</div>
    {slides.length > 1 && <link rel="preload" as="image" href={slides[(activeIndex + 1) % slides.length]} />}
    <div className="event-hero__shade" /><div className="event-hero__tint" />
    <div className="event-hero__layout">
      <div key={`copy-${activeIndex}-${sequence}`} className="event-hero__copy">
        <div className="event-hero__status"><span />{hero.eyebrow || t('hero.liveEvent')}</div>
        <p className="event-hero__kicker">{hero.tour || hero.venue}</p>
        <div className={`event-hero__title-mask ${titleSize}`}><h1>{hero.title}</h1></div>
        {hero.guests.length > 0 && <p className="event-hero__description"><span className="event-hero__performers">{t('hero.featuring', { guests: hero.guests.join(' · ') })}</span> <span className="event-hero__supporting-copy">{t('hero.description')}</span></p>}
        <div className="event-hero__facts"><div><span>{t('hero.dateTime')}</span><strong>{hero.date}</strong><small>{hero.show}{hero.doors ? ` · ${t('hero.doors', { time: hero.doors })}` : ''}</small></div><div><span>{t('hero.venue')}</span><strong>{hero.venue}</strong><small>{hero.address}</small></div></div>
        <div className="event-hero__actions"><button type="button" className="event-hero__primary" onClick={onPrimary}>{hero.primaryCta || t('hero.bookTickets')} <span>↗</span></button><button type="button" className="event-hero__secondary" onClick={onSecondary}>{hero.secondaryCta || t('hero.explore')} <span>→</span></button></div>
      </div>
      <div className="event-hero__visuals" aria-label={t('hero.highlights')}>
        <div className="event-hero__rail">
          {slides.map((src, index) => {
            const offset = wrap(index - activeIndex, slides.length)
            const selected = index === activeIndex
            return <button type="button" key={`${src}-${index}`} aria-label={t('hero.showCard', { label: label(index) })} aria-current={selected} className={`event-hero__card ${selected ? 'is-active' : ''} ${offset > 2 ? 'is-hidden' : ''}`} style={{ '--card-order': offset } as React.CSSProperties} onClick={() => select(index)}>
              {src && <img src={src} alt="" width="520" height="680" loading={index === activeIndex || index === (activeIndex + 1) % slides.length ? 'eager' : 'lazy'} />}
              <span className="event-hero__card-shade" />
              <span className="event-hero__card-copy"><small>{String(index + 1).padStart(2, '0')}</small><strong>{label(index)}</strong>{packages[index] && <em>{formatPrice(packages[index].price)} · {packages[index].seats} seats</em>}</span>
            </button>
          })}
        </div>
        <div className="event-hero__controls"><div className="event-hero__arrows"><button type="button" onClick={() => select(activeIndex - 1)} aria-label={t('hero.previous')}>←</button><button type="button" onClick={() => select(activeIndex + 1)} aria-label={t('hero.next')}>→</button></div><div className="event-hero__progress" aria-label={t('hero.slide', { current: activeIndex + 1, total: slides.length })}><span>{String(activeIndex + 1).padStart(2, '0')}</span><i><b key={`progress-${activeIndex}-${sequence}`} style={{ animationPlayState: paused ? 'paused' : 'running' }} /></i><span>{String(slides.length).padStart(2, '0')}</span></div></div>
        <div className="event-hero__availability">{startingPrice === null ? t('hero.viewPackages') : t('hero.from', { price: formatPrice(startingPrice) })}<span />{seats > 0 ? t('hero.seatsAvailable', { count: seats.toLocaleString() }) : t('hero.packagesAvailable', { count: packages.length })}</div>
      </div>
    </div>
  </section>
}
