import * as THREE from "three";

/**
 * Mobile Tier Triangle Limits (Category 8, NDU-UPG 351-400):
 * - Tier A: 100,000 triangles (flagship phones / desktop)
 * - Tier B: 30,000 triangles (mid-range Android)
 * - Tier C: 10,000 triangles (low-end / budget devices)
 */
export const TIER_TRIANGLE_LIMITS = {
  A: 100_000,
  B: 30_000,
  C: 10_000,
} as const;

export type MobileTier = keyof typeof TIER_TRIANGLE_LIMITS;

/**
 * Maximum Bounding Dimensions in Metres:
 * - Room scans: <= 50m in width, depth, and height
 * - Props / procedural street furniture: <= 5m in width, depth, and height
 */
export const MAX_DIMENSION_LIMITS = {
  room: 50,
  prop: 5,
} as const;

export type ScanTargetType = keyof typeof MAX_DIMENSION_LIMITS;

export interface MeshBounds {
  x: number;
  y: number;
  z: number;
}

export interface MeshValidationStats {
  triangleCount: number;
  vertexCount: number;
  bounds: MeshBounds;
}

export interface MeshValidationResult {
  valid: boolean;
  errors: string[];
  stats: MeshValidationStats;
}

export interface MeshValidationOptions {
  tier?: MobileTier;
  targetType?: ScanTargetType;
  maxTriangles?: number;
  maxDimension?: number;
}

export interface RawGeometryData {
  positions: Float32Array | number[];
  indices?: Uint16Array | Uint32Array | number[];
}

export interface PrecomputedMeshStats {
  triangleCount: number;
  vertexCount: number;
  bounds: MeshBounds;
}

export type MeshValidationInput =
  | THREE.Object3D
  | THREE.BufferGeometry
  | ArrayBuffer
  | Uint8Array
  | RawGeometryData
  | PrecomputedMeshStats;

/**
 * Validates GLB binary uploads, Three.js Object3D hierarchies,
 * procedural BufferGeometry instances, and raw vertex data.
 */
export function validateMesh(
  input: MeshValidationInput,
  options: MeshValidationOptions = {},
): MeshValidationResult {
  const tier = options.tier ?? "A";
  const targetType = options.targetType ?? "room";
  const maxTris = options.maxTriangles ?? TIER_TRIANGLE_LIMITS[tier];
  const maxDim = options.maxDimension ?? MAX_DIMENSION_LIMITS[targetType];

  const errors: string[] = [];
  let stats: MeshValidationStats = {
    triangleCount: 0,
    vertexCount: 0,
    bounds: { x: 0, y: 0, z: 0 },
  };

  try {
    if (isPrecomputedStats(input)) {
      stats = { ...input };
      validateCoordinatesAndBounds(stats.bounds, errors);
    } else if (isGlbBuffer(input)) {
      stats = extractStatsFromGlb(input, errors);
    } else if (isBufferGeometry(input)) {
      stats = extractStatsFromBufferGeometry(input, errors);
    } else if (isRawGeometry(input)) {
      stats = extractStatsFromRawData(input, errors);
    } else if (isObject3D(input)) {
      stats = extractStatsFromObject3D(input, errors);
    } else {
      errors.push("Unsupported mesh input format");
    }
  } catch (err) {
    errors.push(`Failed to parse mesh geometry: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 1. Non-zero vertices check
  if (stats.vertexCount <= 0) {
    errors.push("Mesh contains zero vertices");
  }

  // 2. Mobile tier triangle limits check
  if (stats.triangleCount > maxTris) {
    errors.push(
      `Triangle count (${stats.triangleCount.toLocaleString()}) exceeds Tier ${tier} limit of ${maxTris.toLocaleString()}`,
    );
  }

  // 3. Dimension limit checks (width, height, depth)
  if (
    stats.bounds.x > maxDim ||
    stats.bounds.y > maxDim ||
    stats.bounds.z > maxDim
  ) {
    errors.push(
      `Bounding dimension exceeds ${targetType} scan limit of ${maxDim}m (dimensions: ${stats.bounds.x.toFixed(2)}m × ${stats.bounds.y.toFixed(2)}m × ${stats.bounds.z.toFixed(2)}m)`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    stats,
  };
}

/**
 * Procedural geometry validator helper.
 */
export function validateProceduralGeometry(
  geometry: THREE.BufferGeometry,
  options: MeshValidationOptions = {},
): MeshValidationResult {
  return validateMesh(geometry, { targetType: "prop", ...options });
}

/**
 * GLB upload validator helper.
 */
export function validateGlbUpload(
  buffer: ArrayBuffer | Uint8Array,
  options: MeshValidationOptions = {},
): MeshValidationResult {
  return validateMesh(buffer, { targetType: "room", ...options });
}

// ---------------------------------------------------------------------------
// Helpers and Extractors
// ---------------------------------------------------------------------------

function isPrecomputedStats(input: unknown): input is PrecomputedMeshStats {
  return (
    typeof input === "object" &&
    input !== null &&
    "triangleCount" in input &&
    "vertexCount" in input &&
    "bounds" in input &&
    !("isBufferGeometry" in input) &&
    !("isObject3D" in input)
  );
}

function isGlbBuffer(input: unknown): input is ArrayBuffer | Uint8Array {
  if (input instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(input) && !(input instanceof Float32Array)) {
    return true;
  }
  return false;
}

function isBufferGeometry(input: unknown): input is THREE.BufferGeometry {
  return typeof input === "object" && input !== null && ("isBufferGeometry" in input || input instanceof THREE.BufferGeometry);
}

function isObject3D(input: unknown): input is THREE.Object3D {
  return typeof input === "object" && input !== null && ("isObject3D" in input || input instanceof THREE.Object3D);
}

function isRawGeometry(input: unknown): input is RawGeometryData {
  return (
    typeof input === "object" &&
    input !== null &&
    "positions" in input &&
    (Array.isArray((input as RawGeometryData).positions) ||
      (input as RawGeometryData).positions instanceof Float32Array)
  );
}

function validateCoordinatesAndBounds(bounds: MeshBounds, errors: string[]): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.z) ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.z < 0
  ) {
    errors.push("Mesh contains non-finite or negative bounding box dimensions");
  }
}

function extractStatsFromBufferGeometry(
  geom: THREE.BufferGeometry,
  errors: string[],
): MeshValidationStats {
  const posAttr = geom.getAttribute("position");
  if (!posAttr) {
    errors.push("Geometry missing position attribute");
    return { triangleCount: 0, vertexCount: 0, bounds: { x: 0, y: 0, z: 0 } };
  }

  const vertexCount = posAttr.count;
  const triangleCount = geom.index
    ? Math.floor(geom.index.count / 3)
    : Math.floor(vertexCount / 3);

  // Check finite coordinates
  let hasNonFinite = false;
  for (let i = 0; i < posAttr.array.length; i++) {
    if (!Number.isFinite(posAttr.array[i])) {
      hasNonFinite = true;
      break;
    }
  }
  if (hasNonFinite) {
    errors.push("Mesh contains non-finite vertex coordinates (NaN or Infinity)");
  }

  geom.computeBoundingBox();
  const box = geom.boundingBox;
  let bounds: MeshBounds = { x: 0, y: 0, z: 0 };
  if (box) {
    if (
      !Number.isFinite(box.min.x) ||
      !Number.isFinite(box.max.x) ||
      !Number.isFinite(box.min.y) ||
      !Number.isFinite(box.max.y) ||
      !Number.isFinite(box.min.z) ||
      !Number.isFinite(box.max.z)
    ) {
      errors.push("Mesh bounding box contains non-finite coordinates");
    } else {
      bounds = {
        x: Math.max(0, box.max.x - box.min.x),
        y: Math.max(0, box.max.y - box.min.y),
        z: Math.max(0, box.max.z - box.min.z),
      };
    }
  }

  return { triangleCount, vertexCount, bounds };
}

function extractStatsFromObject3D(
  object: THREE.Object3D,
  errors: string[],
): MeshValidationStats {
  let vertexCount = 0;
  let triangleCount = 0;
  let hasNonFinite = false;

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const posAttr = mesh.geometry.getAttribute("position");
      if (posAttr) {
        vertexCount += posAttr.count;
        if (mesh.geometry.index) {
          triangleCount += Math.floor(mesh.geometry.index.count / 3);
        } else {
          triangleCount += Math.floor(posAttr.count / 3);
        }
        for (let i = 0; i < posAttr.array.length; i++) {
          if (!Number.isFinite(posAttr.array[i])) {
            hasNonFinite = true;
            break;
          }
        }
      }
    }
  });

  if (hasNonFinite) {
    errors.push("Mesh contains non-finite vertex coordinates (NaN or Infinity)");
  }

  const box = new THREE.Box3().setFromObject(object);
  let bounds: MeshBounds = { x: 0, y: 0, z: 0 };
  if (!box.isEmpty()) {
    if (
      !Number.isFinite(box.min.x) ||
      !Number.isFinite(box.max.x) ||
      !Number.isFinite(box.min.y) ||
      !Number.isFinite(box.max.y) ||
      !Number.isFinite(box.min.z) ||
      !Number.isFinite(box.max.z)
    ) {
      errors.push("Mesh bounding box contains non-finite coordinates");
    } else {
      bounds = {
        x: Math.max(0, box.max.x - box.min.x),
        y: Math.max(0, box.max.y - box.min.y),
        z: Math.max(0, box.max.z - box.min.z),
      };
    }
  }

  return { triangleCount, vertexCount, bounds };
}

function extractStatsFromRawData(
  raw: RawGeometryData,
  errors: string[],
): MeshValidationStats {
  const positions = raw.positions;
  const vertexCount = Math.floor(positions.length / 3);

  let hasNonFinite = false;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      hasNonFinite = true;
      continue;
    }

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  if (hasNonFinite) {
    errors.push("Mesh contains non-finite vertex coordinates (NaN or Infinity)");
  }

  const triangleCount = raw.indices
    ? Math.floor(raw.indices.length / 3)
    : Math.floor(vertexCount / 3);

  const bounds: MeshBounds =
    vertexCount > 0 && Number.isFinite(minX) && Number.isFinite(maxX)
      ? {
          x: Math.max(0, maxX - minX),
          y: Math.max(0, maxY - minY),
          z: Math.max(0, maxZ - minZ),
        }
      : { x: 0, y: 0, z: 0 };

  return { triangleCount, vertexCount, bounds };
}

/**
 * GLB binary parser extracting header, JSON chunk, meshes, and accessor bounds.
 */
function extractStatsFromGlb(
  bufferInput: ArrayBuffer | Uint8Array,
  errors: string[],
): MeshValidationStats {
  const bytes =
    bufferInput instanceof Uint8Array
      ? bufferInput
      : new Uint8Array(bufferInput);

  if (bytes.byteLength < 12) {
    errors.push("Invalid GLB buffer: buffer too small for 12-byte header");
    return { triangleCount: 0, vertexCount: 0, bounds: { x: 0, y: 0, z: 0 } };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  // 0x46546C67 = "glTF"
  if (magic !== 0x46546c67) {
    errors.push("Invalid GLB header: magic number mismatch (not glTF)");
    return { triangleCount: 0, vertexCount: 0, bounds: { x: 0, y: 0, z: 0 } };
  }

  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  // 0x4E4F534A = "JSON"
  if (chunkType !== 0x4e4f534a) {
    errors.push("Invalid GLB structure: chunk 0 is not JSON");
    return { triangleCount: 0, vertexCount: 0, bounds: { x: 0, y: 0, z: 0 } };
  }

  const jsonBytes = bytes.subarray(20, 20 + chunkLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  const gltf = JSON.parse(jsonText);

  let vertexCount = 0;
  let triangleCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let hasNonFinite = false;

  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];

  for (const mesh of meshes) {
    if (!Array.isArray(mesh.primitives)) continue;
    for (const prim of mesh.primitives) {
      const posAccIdx = prim.attributes?.POSITION;
      if (typeof posAccIdx === "number" && accessors[posAccIdx]) {
        const posAcc = accessors[posAccIdx];
        const vCount = typeof posAcc.count === "number" ? posAcc.count : 0;
        vertexCount += vCount;

        if (Array.isArray(posAcc.min) && Array.isArray(posAcc.max)) {
          const [mnX, mnY, mnZ] = posAcc.min;
          const [mxX, mxY, mxZ] = posAcc.max;

          if (
            !Number.isFinite(mnX) ||
            !Number.isFinite(mnY) ||
            !Number.isFinite(mnZ) ||
            !Number.isFinite(mxX) ||
            !Number.isFinite(mxY) ||
            !Number.isFinite(mxZ)
          ) {
            hasNonFinite = true;
          } else {
            if (mnX < minX) minX = mnX;
            if (mxX > maxX) maxX = mxX;
            if (mnY < minY) minY = mnY;
            if (mxY > maxY) maxY = mxY;
            if (mnZ < minZ) minZ = mnZ;
            if (mxZ > maxZ) maxZ = mxZ;
          }
        }
      }

      if (typeof prim.indices === "number" && accessors[prim.indices]) {
        const indAcc = accessors[prim.indices];
        const iCount = typeof indAcc.count === "number" ? indAcc.count : 0;
        triangleCount += Math.floor(iCount / 3);
      } else if (typeof posAccIdx === "number" && accessors[posAccIdx]) {
        const posAcc = accessors[posAccIdx];
        const vCount = typeof posAcc.count === "number" ? posAcc.count : 0;
        triangleCount += Math.floor(vCount / 3);
      }
    }
  }

  if (hasNonFinite) {
    errors.push("Mesh contains non-finite vertex coordinates (NaN or Infinity)");
  }

  const bounds: MeshBounds =
    vertexCount > 0 && Number.isFinite(minX) && Number.isFinite(maxX)
      ? {
          x: Math.max(0, maxX - minX),
          y: Math.max(0, maxY - minY),
          z: Math.max(0, maxZ - minZ),
        }
      : { x: 0, y: 0, z: 0 };

  return { triangleCount, vertexCount, bounds };
}
