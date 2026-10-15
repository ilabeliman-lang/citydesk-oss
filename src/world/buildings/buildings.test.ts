import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHeight,
  parseLevels,
  calculateRoofAllowance,
  resolveMinHeight,
  resolveLanduseKey,
  resolveBuildingHeight,
  LANDUSE_PRIORS,
  DEFAULT_LEVEL_HEIGHT_M,
} from './heightResolver.ts';
import {
  normalizeRoofShape,
  detectRegion,
  normalizeColour,
  normalizeMaterial,
  resolveRoofMaterial,
  resolveRoofColour,
  getRoofSpec,
} from './roofTypes.ts';
import {
  assessBuildingQuality,
  isMachineLearningSource,
  QUALITY_CHIPS,
} from './buildingQuality.ts';

// ============================================================================
// 1. Height Resolver Unit Tests
// ============================================================================

test('parseHeight handles standard meters, unit suffixes, and commas', () => {
  assert.equal(parseHeight('15'), 15);
  assert.equal(parseHeight('15 m'), 15);
  assert.equal(parseHeight('15m'), 15);
  assert.equal(parseHeight('15.5 m'), 15.5);
  assert.equal(parseHeight('15,5'), 15.5);
  assert.equal(parseHeight('15 meters'), 15);
  assert.equal(parseHeight('15 metres'), 15);
  assert.equal(parseHeight('15meter'), 15);
  assert.equal(parseHeight('15metre'), 15);
});

test('parseHeight handles imperial feet and inches', () => {
  // 40 ft = 40 * 0.3048 = 12.192 m
  const feetOnly = parseHeight("40'");
  assert.ok(feetOnly !== null && Math.abs(feetOnly - 12.192) < 0.001);

  const feetWord = parseHeight('40 ft');
  assert.ok(feetWord !== null && Math.abs(feetWord - 12.192) < 0.001);

  const feetLongWord = parseHeight('40 feet');
  assert.ok(feetLongWord !== null && Math.abs(feetLongWord - 12.192) < 0.001);

  // 13'6" = 13 * 0.3048 + 6 * 0.0254 = 3.9624 + 0.1524 = 4.1148 m
  const feetInches = parseHeight('13\'6"');
  assert.ok(feetInches !== null && Math.abs(feetInches - 4.115) < 0.01);

  const feetInchesSpaced = parseHeight('13 ft 6 in');
  assert.ok(feetInchesSpaced !== null && Math.abs(feetInchesSpaced - 4.115) < 0.01);
});

test('parseHeight rejects invalid strings, zeros, negatives, and empty values', () => {
  assert.equal(parseHeight('0'), null, 'height=0 is treated as missing');
  assert.equal(parseHeight('0 m'), null);
  assert.equal(parseHeight('-10 m'), null);
  assert.equal(parseHeight('tall'), null);
  assert.equal(parseHeight('yes'), null);
  assert.equal(parseHeight(''), null);
  assert.equal(parseHeight('   '), null);
  assert.equal(parseHeight(undefined), null);
});

test('parseLevels parses integers, decimals, semicolon lists, and rejects invalid', () => {
  assert.equal(parseLevels('3'), 3);
  assert.equal(parseLevels('3.5'), 3.5);
  assert.equal(parseLevels('2;3'), 2);
  assert.equal(parseLevels('4; 5; 6'), 4);
  assert.equal(parseLevels('0'), null);
  assert.equal(parseLevels('-1'), null);
  assert.equal(parseLevels('unknown'), null);
  assert.equal(parseLevels(undefined), null);
});

test('calculateRoofAllowance computes explicit roof height, levels, and pitched shapes', () => {
  // Explicit height
  assert.equal(calculateRoofAllowance({ 'roof:height': '2.5 m' }), 2.5);
  // Explicit levels (1 * 3.0 * 0.75 = 2.25)
  assert.equal(calculateRoofAllowance({ 'roof:levels': '1' }), 2.25);
  // Pitched shapes default to 1.5m
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'gabled' }), 1.5);
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'hipped' }), 1.5);
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'pyramidal' }), 1.5);
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'skillion' }), 1.5);
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'dome' }), 1.5);
  // Flat roof has 0 allowance
  assert.equal(calculateRoofAllowance({ 'roof:shape': 'flat' }), 0.0);
  assert.equal(calculateRoofAllowance({}), 0.0);
});

test('resolveMinHeight supports min_height and building:min_level', () => {
  assert.equal(resolveMinHeight({ min_height: '4.5 m' }), 4.5);
  assert.equal(resolveMinHeight({ 'building:min_height': '6' }), 6);
  assert.equal(resolveMinHeight({ 'building:min_level': '2' }), 6.0);
  assert.equal(resolveMinHeight({}), 0.0);
  // min_height takes precedence over building:min_level
  assert.equal(resolveMinHeight({ min_height: '5 m', 'building:min_level': '1' }), 5);
});

test('resolveBuildingHeight with explicit height OSM tag', () => {
  const res = resolveBuildingHeight({ height: '15 m' });
  assert.equal(res.heightM, 15);
  assert.equal(res.minHeightM, 0);
  assert.equal(res.levels, 5); // 15 / 3.0 = 5 levels
  assert.equal(res.source, 'explicit');

  // Explicit height tag wins over building:levels tag
  const resWithLevels = resolveBuildingHeight({ height: '18 m', 'building:levels': '2' });
  assert.equal(resWithLevels.heightM, 18);
  assert.equal(resWithLevels.levels, 2); // keeps tagged levels
  assert.equal(resWithLevels.source, 'explicit');
});

test('resolveBuildingHeight with building:levels (levels * 3.0m + roof allowance)', () => {
  // 3 levels with flat/no roof = 3 * 3.0 = 9.0m
  const resFlat = resolveBuildingHeight({ 'building:levels': '3' });
  assert.equal(resFlat.heightM, 9.0);
  assert.equal(resFlat.levels, 3);
  assert.equal(resFlat.source, 'levels');

  // 3 levels with gabled roof = 3 * 3.0 + 1.5 = 10.5m
  const resGabled = resolveBuildingHeight({ 'building:levels': '3', 'roof:shape': 'gabled' });
  assert.equal(resGabled.heightM, 10.5);
  assert.equal(resGabled.levels, 3);
  assert.equal(resGabled.source, 'levels');

  // 2 levels with explicit roof height 2.0m = 2 * 3.0 + 2.0 = 8.0m
  const resRoofHeight = resolveBuildingHeight({ 'building:levels': '2', 'roof:height': '2 m' });
  assert.equal(resRoofHeight.heightM, 8.0);
  assert.equal(resRoofHeight.levels, 2);
  assert.equal(resRoofHeight.source, 'levels');
});

test('resolveBuildingHeight handles height=0 gracefully by falling back to levels or priors', () => {
  const resWithLevels = resolveBuildingHeight({ height: '0', 'building:levels': '4' });
  assert.equal(resWithLevels.heightM, 12.0);
  assert.equal(resWithLevels.levels, 4);
  assert.equal(resWithLevels.source, 'levels');

  const resFallback = resolveBuildingHeight({ height: '0' });
  assert.equal(resFallback.source, 'prior');
  assert.equal(resFallback.heightM, 3.5);
});

test('resolveBuildingHeight supports overhangs (min_height / building:min_level)', () => {
  const overhang = resolveBuildingHeight({
    height: '24 m',
    min_height: '6 m',
  });
  assert.equal(overhang.heightM, 24);
  assert.equal(overhang.minHeightM, 6);
  assert.equal(overhang.source, 'explicit');

  const levelOverhang = resolveBuildingHeight({
    'building:levels': '4',
    'building:min_level': '1',
  });
  assert.equal(levelOverhang.minHeightM, 3.0);
  assert.equal(levelOverhang.heightM, 12.0);
  assert.equal(levelOverhang.source, 'levels');
});

test('resolveBuildingHeight applies landuse priors when tags are missing', () => {
  // residential (2 levels = 6.0m)
  const resResidential = resolveBuildingHeight({}, 'residential');
  assert.equal(resResidential.heightM, 6.0);
  assert.equal(resResidential.levels, 2);
  assert.equal(resResidential.source, 'prior');

  // commercial (3 levels = 9.0m)
  const resCommercial = resolveBuildingHeight({}, 'commercial');
  assert.equal(resCommercial.heightM, 9.0);
  assert.equal(resCommercial.levels, 3);
  assert.equal(resCommercial.source, 'prior');

  // retail (2 levels = 6.0m)
  const resRetail = resolveBuildingHeight({}, 'retail');
  assert.equal(resRetail.heightM, 6.0);
  assert.equal(resRetail.levels, 2);
  assert.equal(resRetail.source, 'prior');

  // industrial (1 tall level = 7.5m)
  const resIndustrial = resolveBuildingHeight({}, 'industrial');
  assert.equal(resIndustrial.heightM, 7.5);
  assert.equal(resIndustrial.levels, 1);
  assert.equal(resIndustrial.source, 'prior');

  // default fallback (1 level = 3.5m)
  const resDefault = resolveBuildingHeight({});
  assert.equal(resDefault.heightM, 3.5);
  assert.equal(resDefault.levels, 1);
  assert.equal(resDefault.source, 'prior');
});

test('resolveBuildingHeight recognizes landuse from tags and building typology', () => {
  // Tagged landuse in tags object
  const byTag = resolveBuildingHeight({ landuse: 'commercial' });
  assert.equal(byTag.heightM, 9.0);
  assert.equal(byTag.source, 'prior');

  // Typology mapping
  const byHouse = resolveBuildingHeight({ building: 'house' });
  assert.equal(byHouse.heightM, 6.0);
  assert.equal(byHouse.levels, 2);
  assert.equal(byHouse.source, 'prior');

  const byWarehouse = resolveBuildingHeight({ building: 'warehouse' });
  assert.equal(byWarehouse.heightM, 7.5);
  assert.equal(byWarehouse.levels, 1);
  assert.equal(byWarehouse.source, 'prior');

  const byOffice = resolveBuildingHeight({ building: 'office' });
  assert.equal(byOffice.heightM, 9.0);
  assert.equal(byOffice.levels, 3);
  assert.equal(byOffice.source, 'prior');
});

// ============================================================================
// 2. Roof Types Unit Tests
// ============================================================================

test('normalizeRoofShape correctly identifies standard OSM roof shapes', () => {
  assert.equal(normalizeRoofShape('flat'), 'flat');
  assert.equal(normalizeRoofShape('gabled'), 'gabled');
  assert.equal(normalizeRoofShape('saddle'), 'gabled');
  assert.equal(normalizeRoofShape('hipped'), 'hipped');
  assert.equal(normalizeRoofShape('pyramidal'), 'pyramidal');
  assert.equal(normalizeRoofShape('pyramid'), 'pyramidal');
  assert.equal(normalizeRoofShape('tent'), 'pyramidal');
  assert.equal(normalizeRoofShape('skillion'), 'skillion');
  assert.equal(normalizeRoofShape('shed'), 'skillion');
  assert.equal(normalizeRoofShape('mono-pitch'), 'skillion');
  assert.equal(normalizeRoofShape('dome'), 'dome');
  assert.equal(normalizeRoofShape('cupola'), 'dome');
  assert.equal(normalizeRoofShape('mansard'), 'mansard');
  assert.equal(normalizeRoofShape('gambrel'), 'gambrel');
  assert.equal(normalizeRoofShape('unusual_custom_roof'), 'other');
  assert.equal(normalizeRoofShape(undefined), 'flat');
});

test('detectRegion identifies Hawaii and West Africa by region tag or coordinates', () => {
  // Explicit region string
  assert.equal(detectRegion({ region: 'hawaii' }), 'hawaii');
  assert.equal(detectRegion({ region: 'west_africa' }), 'west_africa');
  assert.equal(detectRegion({ region: 'west-africa' }), 'west_africa');

  // Hawaii lat/lon (e.g. Honolulu: 21.3069, -157.8583)
  assert.equal(detectRegion({ lat: 21.3069, lon: -157.8583 }), 'hawaii');

  // West Africa lat/lon (e.g. Accra, Ghana: 5.6037, -0.1870; Lagos, Nigeria: 6.5244, 3.3792)
  assert.equal(detectRegion({ lat: 5.6037, lon: -0.187 }), 'west_africa');
  assert.equal(detectRegion({ lat: 6.5244, lon: 3.3792 }), 'west_africa');

  // Coordinates outside these regions
  assert.equal(detectRegion({ lat: 51.5074, lon: -0.1278 }), 'default'); // London
  assert.equal(detectRegion(undefined), 'default');
});

test('resolveRoofMaterial maps corrugated metal in West Africa and clay tile in Hawaii', () => {
  // West Africa vernacular: corrugated metal
  const westAfricaSpec = getRoofSpec({}, { region: 'west_africa' });
  assert.equal(westAfricaSpec.material, 'corrugated_metal');
  assert.equal(westAfricaSpec.colour, '#9ca3af');

  // Hawaii vernacular: clay tile
  const hawaiiSpec = getRoofSpec({}, { region: 'hawaii' });
  assert.equal(hawaiiSpec.material, 'clay_tiles');
  assert.equal(hawaiiSpec.colour, '#c2410c');

  // Tagged material overrides regional prior
  const taggedSpec = getRoofSpec(
    { 'roof:material': 'slate', 'roof:colour': '#1e293b' },
    { region: 'hawaii' }
  );
  assert.equal(taggedSpec.material, 'slate');
  assert.equal(taggedSpec.colour, '#1e293b');
});

test('getRoofSpec calculates isPitched, heightM, and tagged vs inferred source', () => {
  // Pitched gabled roof
  const gabled = getRoofSpec({ 'roof:shape': 'gabled' });
  assert.equal(gabled.shape, 'gabled');
  assert.equal(gabled.isPitched, true);
  assert.equal(gabled.heightM, 1.5);
  assert.equal(gabled.source, 'tagged');

  // Flat roof
  const flat = getRoofSpec({ 'roof:shape': 'flat' });
  assert.equal(flat.shape, 'flat');
  assert.equal(flat.isPitched, false);
  assert.equal(flat.heightM, 0.0);
  assert.equal(flat.source, 'tagged');

  // Untagged building
  const untagged = getRoofSpec({});
  assert.equal(untagged.shape, 'flat');
  assert.equal(untagged.isPitched, false);
  assert.equal(untagged.source, 'inferred');

  // Explicit roof:height
  const explicitHeight = getRoofSpec({ 'roof:shape': 'hipped', 'roof:height': '3.2 m' });
  assert.equal(explicitHeight.heightM, 3.2);
  assert.equal(explicitHeight.isPitched, true);
});

// ============================================================================
// 3. Building Quality Unit Tests
// ============================================================================

test('assessBuildingQuality assigns "tagged" badge for explicit height or levels', () => {
  // Explicit height tag
  const qHeight = assessBuildingQuality({ height: '15m' });
  assert.equal(qHeight.badge, 'tagged');
  assert.equal(qHeight.chip.badge, 'tagged');
  assert.equal(qHeight.score, 1.0);
  assert.equal(qHeight.details.hasExplicitHeight, true);

  // Building levels tag
  const qLevels = assessBuildingQuality({ 'building:levels': '3' });
  assert.equal(qLevels.badge, 'tagged');
  assert.equal(qLevels.score, 0.85);
  assert.equal(qLevels.details.hasLevels, true);

  // Override source 'tagged'
  const qSource = assessBuildingQuality({ building: 'yes' }, 'tagged');
  assert.equal(qSource.badge, 'tagged');
});

test('assessBuildingQuality assigns "inferred_height" badge when height/levels are missing', () => {
  const qInferred = assessBuildingQuality({ building: 'residential', name: 'Pine Villa' });
  assert.equal(qInferred.badge, 'inferred_height');
  assert.equal(qInferred.chip.badge, 'inferred_height');
  assert.equal(qInferred.details.hasExplicitHeight, false);
  assert.equal(qInferred.details.hasLevels, false);
  assert.ok(qInferred.score >= 0.7);
});

test('assessBuildingQuality assigns "ml_footprint" badge for AI/satellite datasets', () => {
  // Source parameter
  const qMlParam = assessBuildingQuality({ building: 'yes' }, 'ml_footprint');
  assert.equal(qMlParam.badge, 'ml_footprint');
  assert.equal(qMlParam.chip.badge, 'ml_footprint');
  assert.equal(qMlParam.details.isMlDerived, true);

  // Microsoft Building Footprints source tag
  const qMsTag = assessBuildingQuality({
    building: 'yes',
    source: 'microsoft/BuildingFootprints',
  });
  assert.equal(qMsTag.badge, 'ml_footprint');

  // Google Open Buildings source tag
  const qGoogle = assessBuildingQuality({
    building: 'yes',
    'source:geometry': 'google_open_buildings_v3',
  });
  assert.equal(qGoogle.badge, 'ml_footprint');
});

test('QUALITY_CHIPS metadata contains complete styling attributes', () => {
  const badges: ('tagged' | 'inferred_height' | 'ml_footprint')[] = [
    'tagged',
    'inferred_height',
    'ml_footprint',
  ];
  for (const b of badges) {
    const chip = QUALITY_CHIPS[b];
    assert.ok(chip.label.length > 0);
    assert.ok(chip.description.length > 0);
    assert.ok(chip.color.startsWith('#'));
    assert.ok(chip.bgColour.length > 0);
    assert.ok(chip.icon.length > 0);
  }
});

// ============================================================================
// 4. Integrated End-to-End Tests
// ============================================================================

test('End-to-end building pipeline: Honolulu clay-tiled residential villa', () => {
  const osmTags = {
    building: 'house',
    'roof:shape': 'hipped',
    'addr:street': 'Kalakaua Ave',
  };
  const hawaiiContext = { region: 'hawaii', lat: 21.278, lon: -157.828 };

  const height = resolveBuildingHeight(osmTags);
  const roof = getRoofSpec(osmTags, hawaiiContext);
  const quality = assessBuildingQuality(osmTags);

  // Height inferred from house (residential prior 6.0m + hipped roof 1.5m = 7.5m)
  assert.equal(height.source, 'prior');
  assert.equal(height.heightM, 7.5);
  assert.equal(height.levels, 2);

  // Roof is hipped with clay tiles in Hawaii
  assert.equal(roof.shape, 'hipped');
  assert.equal(roof.material, 'clay_tiles');
  assert.equal(roof.colour, '#c2410c');
  assert.equal(roof.isPitched, true);

  // Quality chip is inferred height
  assert.equal(quality.badge, 'inferred_height');
});

test('End-to-end building pipeline: Lagos West Africa corrugated metal commercial tower', () => {
  const osmTags = {
    building: 'commercial',
    'building:levels': '5',
    'roof:shape': 'skillion',
  };
  const westAfricaContext = { region: 'west_africa', lat: 6.524, lon: 3.379 };

  const height = resolveBuildingHeight(osmTags);
  const roof = getRoofSpec(osmTags, westAfricaContext);
  const quality = assessBuildingQuality(osmTags);

  // Height: 5 * 3.0m + 1.5m skillion = 16.5m
  assert.equal(height.source, 'levels');
  assert.equal(height.heightM, 16.5);
  assert.equal(height.levels, 5);

  // Roof is skillion with corrugated metal
  assert.equal(roof.shape, 'skillion');
  assert.equal(roof.material, 'corrugated_metal');
  assert.equal(roof.colour, '#9ca3af');
  assert.equal(roof.isPitched, true);

  // Quality is tagged (has building:levels)
  assert.equal(quality.badge, 'tagged');
});
