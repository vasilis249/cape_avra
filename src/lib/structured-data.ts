import type { Locale } from "@/i18n/routing";
import { getPhoto } from "@/lib/photos";
import { siteUrl } from "@/lib/seo";
import { capacity } from "@content/property";
import { siteConfig } from "@content/site.config";

/**
 * schema.org VacationRental. Only verifiable facts: no ratings, no prices
 * (added in Phase 3 from real data), no exact coordinates until confirmed.
 */
export function vacationRentalJsonLd(locale: Locale, url: string, description: string) {
  const images = (["blue-hour-agaves", "garden-to-the-sea", "sunset-clouds", "garden-sunset-lawn"] as const).map(
    (id) => siteUrl + getPhoto(id, locale).src,
  );
  return {
    "@context": "https://schema.org",
    "@type": "VacationRental",
    "@id": `${siteUrl}/#cape-avra`,
    name: siteConfig.name,
    url,
    description,
    image: images,
    inLanguage: locale,
    address: {
      "@type": "PostalAddress",
      addressLocality: siteConfig.address.locality,
      addressRegion: siteConfig.address.region,
      postalCode: siteConfig.address.postalCode,
      addressCountry: siteConfig.address.country,
    },
    containsPlace: {
      "@type": "Accommodation",
      additionalType: "EntirePlace",
      numberOfBedrooms: capacity.bedrooms,
      numberOfBathroomsTotal: capacity.bathrooms,
      occupancy: { "@type": "QuantitativeValue", maxValue: capacity.guests },
      amenityFeature: [
        { "@type": "LocationFeatureSpecification", name: "Sea view", value: true },
        { "@type": "LocationFeatureSpecification", name: "Garden", value: true },
        { "@type": "LocationFeatureSpecification", name: "Beach access", value: true },
        { "@type": "LocationFeatureSpecification", name: "Outdoor grill", value: true },
      ],
    },
    ...(siteConfig.social.instagram
      ? { sameAs: [`https://www.instagram.com/${siteConfig.social.instagram}/`] }
      : {}),
  };
}
