import React from "react";

const eiahSymbol = new URL("../../assets/brand/eiah-symbol.svg", import.meta.url).href;

type EiahBrandMarkProps = {
  brandName?: string;
  className?: string;
  logoUrl?: string | null;
  visibleName?: boolean;
};

export function EiahBrandMark({
  brandName = "EIAH",
  className = "h-10 w-10",
  logoUrl,
  visibleName = false,
}: EiahBrandMarkProps) {
  const customLogoUrl = logoUrl?.trim();
  const src = customLogoUrl || eiahSymbol;
  const accessibleName = customLogoUrl ? `${brandName} logo` : "EIAH";

  return (
    <img
      src={src}
      alt={visibleName ? "" : accessibleName}
      aria-hidden={visibleName ? true : undefined}
      width={40}
      height={40}
      className={`object-contain ${className}`}
    />
  );
}

export default EiahBrandMark;
