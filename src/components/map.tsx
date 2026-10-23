'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  href?: string;
}

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Leaflet map (client-only). Tiles need network access; markers render regardless. */
export function MapView({ points, className, zoom = 14 }: { points: MapPoint[]; className?: string; zoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current || !points.length) return;
      map = L.map(ref.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(TILE, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        className: '',
        html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#8b42f5,#ff8fc8);border:3px solid #fff;box-shadow:0 6px 16px -4px rgba(139,66,245,.7)"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const markers = points.map((p) => {
        const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        m.bindPopup(p.href ? `<a href="${p.href}" style="font-weight:600;color:#6f2ad8">${p.label.replace(/</g, '&lt;')}</a>` : p.label.replace(/</g, '&lt;'));
        return m;
      });
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], zoom);
      else map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, zoom]);
  return <div ref={ref} className={className} style={{ background: 'linear-gradient(135deg,#efe0ff,#ffe3ef)' }} />;
}
