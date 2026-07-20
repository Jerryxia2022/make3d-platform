import { readFile } from "node:fs/promises";
import type { ModelDimensionsMm } from "../shared/modelGeometry.ts";

export type StlTopologyAnalysis = {
  componentCount: number;
  triangleCount: number;
};

export type StlMeshInspection = StlTopologyAnalysis & {
  dimensions: ModelDimensionsMm;
  format: "binary" | "ascii";
  degenerateTriangleCount: number;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  selfIntersectionCheck: "not_performed";
  normalCheck: "not_performed";
};

const MAX_ANALYSIS_TRIANGLES = 120_000;

type Triangle = [string, string, string];

export async function analyzeStlTopology(filePath: string): Promise<StlTopologyAnalysis> {
  const buffer = await readFile(filePath);
  const triangles = parseStlTriangles(buffer);
  validateTriangleCount(triangles.length);

  return {
    componentCount: countConnectedComponents(triangles),
    triangleCount: triangles.length,
  };
}

export async function readStlDimensions(filePath: string): Promise<ModelDimensionsMm> {
  return readStlDimensionsFromBuffer(await readFile(filePath));
}

export async function inspectStlMesh(filePath: string): Promise<StlMeshInspection> {
  const buffer = await readFile(filePath);
  const triangles = parseStlTriangles(buffer);
  validateTriangleCount(triangles.length);

  const edgeCounts = new Map<string, number>();
  let degenerateTriangleCount = 0;
  for (const triangle of triangles) {
    if (new Set(triangle).size < 3) degenerateTriangleCount += 1;
    for (const [left, right] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      const key = left < right ? `${left}|${right}` : `${right}|${left}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    if (count > 2) nonManifoldEdgeCount += 1;
  }

  return {
    componentCount: countConnectedComponents(triangles),
    triangleCount: triangles.length,
    dimensions: readStlDimensionsFromBuffer(buffer),
    format: looksLikeBinaryStl(buffer) ? "binary" : "ascii",
    degenerateTriangleCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    selfIntersectionCheck: "not_performed",
    normalCheck: "not_performed",
  };
}

function validateTriangleCount(triangleCount: number) {
  if (triangleCount === 0) {
    throw new StlAnalysisError("MESH_EMPTY", "STEP 文件中未检测到可打印实体。");
  }
  if (triangleCount > MAX_ANALYSIS_TRIANGLES) {
    throw new StlAnalysisError(
      "MESH_COMPONENT_ANALYSIS_LIMIT",
      "模型网格过于复杂，无法安全确认独立实体数量，请联系人工报价。",
    );
  }
}

function parseStlTriangles(buffer: Buffer): Triangle[] {
  if (looksLikeBinaryStl(buffer)) return parseBinaryStlTriangles(buffer);
  return parseAsciiStlTriangles(buffer.toString("utf8"));
}

function looksLikeBinaryStl(buffer: Buffer) {
  if (buffer.length < 84) return false;
  const triangleCount = buffer.readUInt32LE(80);
  return 84 + triangleCount * 50 === buffer.length;
}

function parseBinaryStlTriangles(buffer: Buffer): Triangle[] {
  const triangleCount = buffer.readUInt32LE(80);
  const triangles: Triangle[] = [];

  for (let index = 0; index < triangleCount; index += 1) {
    const offset = 84 + index * 50 + 12;
    triangles.push([
      readVertexKey(buffer, offset),
      readVertexKey(buffer, offset + 12),
      readVertexKey(buffer, offset + 24),
    ]);
  }

  return triangles;
}

function visitBinaryStlVertices(buffer: Buffer, visit: (vertex: [number, number, number]) => void) {
  const triangleCount = buffer.readUInt32LE(80);
  for (let index = 0; index < triangleCount; index += 1) {
    const start = 84 + index * 50 + 12;
    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const offset = start + vertexIndex * 12;
      const vertex: [number, number, number] = [
        buffer.readFloatLE(offset),
        buffer.readFloatLE(offset + 4),
        buffer.readFloatLE(offset + 8),
      ];
      if (vertex.every(Number.isFinite)) visit(vertex);
    }
  }
}

function readVertexKey(buffer: Buffer, offset: number) {
  return [
    normalizeCoordinate(buffer.readFloatLE(offset)),
    normalizeCoordinate(buffer.readFloatLE(offset + 4)),
    normalizeCoordinate(buffer.readFloatLE(offset + 8)),
  ].join(",");
}

function parseAsciiStlTriangles(source: string): Triangle[] {
  const vertices = [...source.matchAll(/vertex\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/gi)]
    .map((match) =>
      [
        normalizeCoordinate(Number(match[1])),
        normalizeCoordinate(Number(match[2])),
        normalizeCoordinate(Number(match[3])),
      ].join(","),
    );
  const triangles: Triangle[] = [];

  for (let index = 0; index + 2 < vertices.length; index += 3) {
    triangles.push([vertices[index], vertices[index + 1], vertices[index + 2]]);
  }

  return triangles;
}

function visitAsciiStlVertices(source: string, visit: (vertex: [number, number, number]) => void) {
  for (const match of source.matchAll(/vertex\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:e[+-]?\d+)?)/gi)) {
    const vertex: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (vertex.every(Number.isFinite)) visit(vertex);
  }
}

function readStlDimensionsFromBuffer(buffer: Buffer): ModelDimensionsMm {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let vertexCount = 0;
  const visit = (vertex: [number, number, number]) => {
    vertexCount += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      if (vertex[axis] < min[axis]) min[axis] = vertex[axis];
      if (vertex[axis] > max[axis]) max[axis] = vertex[axis];
    }
  };

  if (looksLikeBinaryStl(buffer)) visitBinaryStlVertices(buffer, visit);
  else visitAsciiStlVertices(buffer.toString("utf8"), visit);

  if (vertexCount === 0) {
    throw new StlAnalysisError("MESH_DIMENSIONS_MISSING", "模型尺寸无法识别，需人工确认。");
  }

  return {
    x: roundDimension(max[0] - min[0]),
    y: roundDimension(max[1] - min[1]),
    z: roundDimension(max[2] - min[2]),
  };
}

function roundDimension(value: number) {
  return Math.round(value * 1000) / 1000;
}

function countConnectedComponents(triangles: Triangle[]) {
  const parent = Array.from({ length: triangles.length }, (_, index) => index);
  const rank = new Uint8Array(triangles.length);
  const vertexToTriangle = new Map<string, number>();

  triangles.forEach((triangle, triangleIndex) => {
    for (const vertex of triangle) {
      const previousTriangle = vertexToTriangle.get(vertex);
      if (previousTriangle == null) vertexToTriangle.set(vertex, triangleIndex);
      else union(parent, rank, triangleIndex, previousTriangle);
    }
  });

  return new Set(parent.map((_, index) => find(parent, index))).size;
}

function union(parent: number[], rank: Uint8Array, left: number, right: number) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot === rightRoot) return;

  if (rank[leftRoot] < rank[rightRoot]) parent[leftRoot] = rightRoot;
  else if (rank[leftRoot] > rank[rightRoot]) parent[rightRoot] = leftRoot;
  else {
    parent[rightRoot] = leftRoot;
    rank[leftRoot] += 1;
  }
}

function find(parent: number[], index: number): number {
  let root = index;
  while (parent[root] !== root) root = parent[root];
  while (parent[index] !== index) {
    const next = parent[index];
    parent[index] = root;
    index = next;
  }
  return root;
}

function normalizeCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(5) : "NaN";
}

export class StlAnalysisError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StlAnalysisError";
    this.code = code;
  }
}
