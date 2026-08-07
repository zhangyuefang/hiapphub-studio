import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n";
import { getWebBase } from "@/lib/api";

interface Banner {
  id: string;
  title: string;
  titleI18n: Record<string, string> | null;
  subtitle: string | null;
  subtitleI18n: Record<string, string> | null;
  imageUrl: string;
  linkType: string;
  linkTarget: string;
}

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => setCurrent((c) => (c + 1) % banners.length), [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [banners.length, next]);

  if (banners.length === 0) return null;

  const handleClick = (banner: Banner) => {
    if (banner.linkType === "app") navigate(`/app/${banner.linkTarget}`);
    else if (banner.linkType === "category") navigate(`/category/${banner.linkTarget}`);
    else if (banner.linkType === "url") window.open(banner.linkTarget, "_blank");
  };

  return (
    <div className="relative rounded-xl overflow-hidden cursor-pointer" style={{ height: 160 }}>
      {banners.map((banner, i) => {
        const title = banner.titleI18n?.[locale] ?? banner.title;
        const subtitle = banner.subtitleI18n?.[locale] ?? banner.subtitle;
        const imgSrc = banner.imageUrl.startsWith("http") ? banner.imageUrl : `${getWebBase()}${banner.imageUrl}`;
        return (
          <div
            key={banner.id}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === current ? 1 : 0, pointerEvents: i === current ? "auto" : "none" }}
            onClick={() => handleClick(banner)}
          >
            <img src={imgSrc} className="w-full h-full object-cover" alt={title} loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <h3 className="text-base font-semibold">{title}</h3>
              {subtitle && <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        );
      })}

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-2 right-3 flex gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: i === current ? "#fff" : "rgba(255,255,255,0.4)" }}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
