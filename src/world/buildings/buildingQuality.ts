/**
 * Category 2: Building Realism & City Data (items 51–100)
 * Building Quality: assesses building data quality and generates badge/chip metadata:
 * - 'tagged': Surveyed OSM height / level tags.
 * - 'inferred_height': Surveyed OSM footprint, height inferred from typology / landuse priors.
 * - 'ml_footprint': Footprint generated from machine-learning satellite detection (MS / Google).
 */

import { parseHeight, parseLevels, type Tags } from './heightResolver.ts';

export type BuildingQualityBadge = 'tagged' | 'inferred_height' | 'ml_footprint';

export interface QualityChipMetadata {
  badge: BuildingQualityBadge;
  label: string;
  description: string;
  color: string;
  bgColour: string;
  icon: string;
}

export const QUALITY_CHIPS: Record<BuildingQualityBadge, QualityChipMetadata> = {
  tagged: {
    badge: 'tagged',
    label: 'Survey Tagged',
    description: 'Explicit height or level tags verified from OpenStreetMap survey.',
    color: '#16a34a',
    bgColour: 'rgba(22, 163, 74, 0.1)',
    icon: 'check-circle',
  },
  inferred_height: {
    badge: 'inferred_height',
    label: 'Inferred Height',
    description: 'Surveyed OSM footprint; height estimated using typology and landuse priors.',
    color: '#ea580c',
    bgColour: 'rgba(234, 88, 12, 0.1)',
    icon: 'sparkles',
  },
  ml_footprint: {
    badge: 'ml_footprint',
    label: 'ML Footprint',
    description: 'Footprint extracted from satellite imagery machine-learning segmentation.',
    color: '#2563eb',
    bgColour: 'rgba(37, 99, 235, 0.1)',
    icon: 'cpu',
  },
};

export interface BuildingQualityAssessment {
  badge: BuildingQualityBadge;
  label: string;
  description: string;
  score: number;
  chip: QualityChipMetadata;
  details: {
    hasExplicitHeight: boolean;
    hasLevels: boolean;
    hasRoofDetails: boolean;
    hasAddress: boolean;
    hasName: boolean;
    isMlDerived: boolean;
    footprintSource: string;
  };
}

/**
 * Checks whether the source parameter or OSM tags indicate an ML-extracted footprint.
 */
export function isMachineLearningSource(tags: Tags, source?: string): boolean {
  if (source) {
    const s = source.toLowerCase();
    if (
      s === 'ml_footprint' ||
      s === 'ml' ||
      s.includes('microsoft') ||
      s.includes('google_open_buildings') ||
      s.includes('open_buildings') ||
      s.includes('deeplearning')
    ) {
      return true;
    }
  }

  const tagSources = [
    tags.source,
    tags['source:geometry'],
    tags['source:footprint'],
    tags['building:source'],
  ]
    .filter(Boolean)
    .map((s) => s!.toLowerCase());

  return tagSources.some(
    (s) =>
      s.includes('microsoft') ||
      s.includes('open buildings') ||
      s.includes('google') ||
      s.includes('ml') ||
      s.includes('deeplearning') ||
      s.includes('ai')
  );
}

/**
 * Assess the quality and provenance of building data.
 * Returns badge metadata chip ('tagged' | 'inferred_height' | 'ml_footprint') and confidence score.
 */
export function assessBuildingQuality(
  tags: Tags,
  source?: string
): BuildingQualityAssessment {
  const hasExplicitHeight = (parseHeight(tags.height) ?? parseHeight(tags['building:height'])) != null;
  const hasLevels = parseLevels(tags['building:levels']) != null;
  const hasRoofDetails = Boolean(tags['roof:shape'] || tags['roof:material'] || tags['roof:colour']);
  const hasAddress = Boolean(tags['addr:street'] || tags['addr:housenumber'] || tags['addr:city']);
  const hasName = Boolean(tags.name);
  const isMlDerived = isMachineLearningSource(tags, source);

  let badge: BuildingQualityBadge;
  let score: number;

  if (source === 'ml_footprint' || (isMlDerived && !hasExplicitHeight && !hasLevels)) {
    badge = 'ml_footprint';
    score = 0.55;
    if (hasRoofDetails) score += 0.1;
  } else if (source === 'inferred_height') {
    badge = 'inferred_height';
    score = 0.7;
    if (hasRoofDetails) score += 0.1;
    if (hasName) score += 0.05;
  } else if (hasExplicitHeight || hasLevels || source === 'tagged') {
    badge = 'tagged';
    score = hasExplicitHeight ? 1.0 : 0.85;
    if (hasRoofDetails) score = Math.min(1.0, score + 0.05);
    if (hasAddress) score = Math.min(1.0, score + 0.05);
  } else if (isMlDerived) {
    badge = 'ml_footprint';
    score = 0.6;
  } else {
    badge = 'inferred_height';
    score = 0.7;
    if (hasRoofDetails) score += 0.1;
    if (hasName) score += 0.05;
  }

  const chip = QUALITY_CHIPS[badge];

  return {
    badge,
    label: chip.label,
    description: chip.description,
    score: Math.round(score * 100) / 100,
    chip,
    details: {
      hasExplicitHeight,
      hasLevels,
      hasRoofDetails,
      hasAddress,
      hasName,
      isMlDerived,
      footprintSource: source ?? (isMlDerived ? 'ml' : 'osm'),
    },
  };
}
